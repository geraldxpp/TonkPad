import { validateMnemonic } from "@scure/bip39";
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
import { nearLookups } from "./secrets-seed-near";

/**
 * BIP-39 recovery phrases in a message (secrets.ts uses these). Words are
 * split on spaces only (\s, which includes the ideographic space Japanese
 * phrases use), so Chinese prose, which has none, is never one long phrase.
 * The wordlists are stored in NFKD form, and so is each word read here.
 * Every step is bounded (checksums, look-ups, words), so no message, however
 * crafted, can hold up the worker.
 */

/** The ten BIP-39 wordlists @scure/bip39 ships. */
const LISTS = [english, spanish, french, italian, portuguese, czech, japanese, korean, simplifiedChinese, traditionalChinese].map((words) => ({ words, set: new Set(words) }));
const LENGTHS = [24, 21, 18, 15, 12];
/** Runs this long from one wordlist are hidden from the model: natural sentences rarely chain more than four. */
export const MASK_RUN = 6;
/**
 * At most this many checksums per message, so a wall of seed words can't
 * stall the worker: one phrase with a few list words around it needs under
 * 70. Past it, the run counts as probable.
 */
const MAX_VALIDATIONS = 120;
/** At most this many words are read: a Telegram message (4,096 characters) holds no more. */
const MAX_WORDS = 2_048;

/** Numbering on its own ("1." "2)" "#3" "(4)" "12"), and in front of a word ("1.abandon"). */
const NUMBERING = /^(?:#?\d{1,2}[.):-]?|\(\d{1,2}\))$/u;
const NUMBER_PREFIX = /^(?:#?\d{1,2}[.):-]|\(\d{1,2}\))/u;
const LEADING = /^[\p{P}\p{S}]+/u;
const EDGE = /[\p{P}\p{S}]/u;

/** Without punctuation and symbols at either end; the end is trimmed in a loop, since an end-anchored regex retries every run of them. */
function trimEdges(word: string): string {
  const chars = [...word.replace(LEADING, "")];
  while (chars.length > 0 && EDGE.test(chars[chars.length - 1])) chars.pop();
  return chars.join("");
}

export interface Token {
  word: string;
  start: number;
  end: number;
}

/** A run of tokens from one wordlist: tokens[from] up to (not including) tokens[to]. */
export interface Run {
  list: number;
  from: number;
  to: number;
}

/** The words of a text (the first `max`) with where each stands, normalized as the wordlists are; numbering is skipped, so it never breaks a run. */
export function tokens(text: string, max = Number.POSITIVE_INFINITY): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/\S+/gu)) {
    if (out.length >= max) break;
    const raw = m[0];
    if (NUMBERING.test(raw)) continue;
    const word = trimEdges(raw.normalize("NFKD").toLowerCase().replace(NUMBER_PREFIX, ""));
    const start = m.index ?? 0;
    if (word !== "") out.push({ word, start, end: start + raw.length });
  }
  return out;
}

/** Every run of at least `min` tokens from one wordlist. */
export function seedRuns(words: readonly Token[], min: number): Run[] {
  const out: Run[] = [];
  LISTS.forEach(({ set }, list) => {
    let from = 0;
    for (let i = 0; i <= words.length; i++) {
      if (i < words.length && set.has(words[i].word)) continue;
      if (i - from >= min) out.push({ list, from, to: i });
      from = i + 1;
    }
  });
  return out;
}

/**
 * A window of a phrase's length with exactly one word not in the list,
 * which reads as a typo of one that is (secrets-seed-near.ts). Each window's
 * count comes from running totals and its odd word from the next one after
 * its start, so a window costs the same however long it is.
 */
function oneOff(words: readonly Token[]): boolean {
  const near = nearLookups();
  return LISTS.some(({ set, words: list }, index) => {
    const outside = new Int32Array(words.length + 1);
    const nextOff = new Int32Array(words.length + 1).fill(words.length);
    for (let i = 0; i < words.length; i++) outside[i + 1] = outside[i] + (set.has(words[i].word) ? 0 : 1);
    for (let i = words.length - 1; i >= 0; i--) nextOff[i] = set.has(words[i].word) ? nextOff[i + 1] : i;
    return LENGTHS.some((length) => {
      for (let from = 0; from + length <= words.length; from++) {
        if (outside[from + length] - outside[from] !== 1) continue;
        if (near(words[nextOff[from]].word, index, list)) return true;
      }
      return false;
    });
  });
}

/**
 * "valid": 12, 15, 18, 21 or 24 words in a row from one wordlist with a
 * valid checksum. "probable": such a run with no valid checksum (any run of
 * 12 or more), or a phrase-length window with one word off. Null otherwise.
 */
export function findSeed(text: string): "valid" | "probable" | null {
  const words = tokens(text, MAX_WORDS);
  let validations = 0;
  let probable = false;
  for (const run of seedRuns(words, 12)) {
    probable = true;
    const list = LISTS[run.list].words;
    for (const length of LENGTHS) {
      for (let from = run.from; from + length <= run.to; from++) {
        if (++validations > MAX_VALIDATIONS) return "probable";
        const phrase = words.slice(from, from + length).map((t) => t.word).join(" ");
        if (validateMnemonic(phrase, list)) return "valid";
      }
    }
  }
  return probable || oneOff(words) ? "probable" : null;
}
