// @vitest-environment node
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist as czech } from "@scure/bip39/wordlists/czech";
import { wordlist as english } from "@scure/bip39/wordlists/english";
import { wordlist as french } from "@scure/bip39/wordlists/french";
import { wordlist as italian } from "@scure/bip39/wordlists/italian";
import { wordlist as japanese } from "@scure/bip39/wordlists/japanese";
import { wordlist as korean } from "@scure/bip39/wordlists/korean";
import { wordlist as portuguese } from "@scure/bip39/wordlists/portuguese";
import { wordlist as simplifiedChinese } from "@scure/bip39/wordlists/simplified-chinese";
import { wordlist as spanish } from "@scure/bip39/wordlists/spanish";
import { wordlist as traditionalChinese } from "@scure/bip39/wordlists/traditional-chinese";
import { describe, expect, it } from "vitest";
import { checkMessage } from "../src/telegram/mod/rules";
import { findSecret } from "../src/telegram/mod/secrets";
import { input } from "./mod-rules-fixtures";

/** The ten BIP-39 wordlists, as the scan reads them. */
const LISTS = { czech, english, french, italian, japanese, korean, portuguese, simplifiedChinese, spanish, traditionalChinese };
/** Entropy bytes for each phrase length. */
const BYTES: Readonly<Record<number, number>> = { 12: 16, 15: 20, 18: 24, 21: 28, 24: 32 };
const entropy = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + seed * 11 + 5) & 0xff);
const separator = (list: string[]) => (list === japanese ? "\u3000" : " ");
const phrase = (list: string[], words: number, seed = 1) => entropyToMnemonic(entropy(BYTES[words], seed), list);

/** The fastest of a few runs, after one to warm up: a single slow run is the machine, not the scan. */
function fastest(run: () => void, times = 3): number {
  run();
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times; i++) {
    const start = performance.now();
    run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

/** 11 list words and one six-letter non-word, over and over, to 4,096 characters: every phrase-length window is one word off. */
function crafted(offWord: (i: number) => string): string {
  const words = english.slice(0, 11);
  let text = "";
  for (let i = 0; text.length < 4_096; i++) text += `${[...words, offWord(i)].join(" ")} `;
  return text.slice(0, 4_096);
}
/** Six letters that aren't a list word, different each time (no cache helps). */
const fresh = (i: number) => `q${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + (Math.floor(i / 26) % 26))}qzx`;

describe("the seed-phrase scan is bounded (abuse#2)", () => {
  it("reads the crafted 4,096-character message in under 50 ms", () => {
    const same = crafted(() => "qqqqqq");
    expect(same.length).toBe(4_096);
    expect(fastest(() => findSecret(same))).toBeLessThan(50);
    expect(fastest(() => checkMessage(input(same)))).toBeLessThan(50);
  });

  it("stays under 50 ms when every off word is different", () => {
    const varied = crafted(fresh);
    expect(fastest(() => findSecret(varied))).toBeLessThan(50);
    expect(fastest(() => checkMessage(input(varied)))).toBeLessThan(50);
  });

  it("stays under 50 ms on a wall of list words and on a wall of near misses", () => {
    const wall = english.slice(100, 700).join(" ").slice(0, 4_096);
    expect(fastest(() => findSecret(wall))).toBeLessThan(50);
    const near = english.slice(0, 600).map((w) => `${w}x`).join(" ").slice(0, 4_096);
    expect(fastest(() => findSecret(near))).toBeLessThan(50);
  });
});

describe("real phrases are still found", () => {
  const cases = Object.entries(LISTS).flatMap(([name, list]) => [12, 15, 18, 21, 24].map((words) => [name, words, list] as const));

  it.each(cases)("%s, %i words: whole, numbered, and one word off", (_, words, list) => {
    const text = phrase(list, words);
    const parts = text.split(separator(list));
    expect(parts).toHaveLength(words);
    expect(findSecret(text)).toBe("seed_phrase");
    expect(findSecret(`my words: ${text}. help`)).toBe("seed_phrase");
    expect(findSecret(parts.map((w, i) => `${i + 1}. ${w}`).join("\n"))).toBe("seed_phrase");
    // One word off: a list word with its last letter doubled, in the middle of the phrase.
    const typo = parts.map((w, i) => (i === Math.floor(words / 2) ? `${w}${[...w].at(-1)}` : w)).join(separator(list));
    expect(findSecret(typo)).not.toBeNull();
  });

  it("finds a phrase one word off after a few near misses", () => {
    // Each group is 11 list words and a non-word; "zz" keeps the phrase from running on into them.
    const misses = Array.from({ length: 10 }, (_, i) => `${english.slice(0, 11).join(" ")} ${fresh(i)}`).join(" ");
    const typo = phrase(english, 12).replace(/(\S+)$/, "$1$1");
    expect(findSecret(typo)).toBe("seed_probable");
    expect(findSecret(`${misses} zz ${typo}`)).toBe("seed_probable");
  });
});
