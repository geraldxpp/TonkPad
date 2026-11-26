// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Strictness } from "../src/telegram/community/types";
import { floodLimit, type FloodInput, FloodWatch } from "../src/telegram/mod/flood";
import { NOW, SEC, MIN } from "./fixtures";

const CHAT = -1001234567890;
let nextId = 1;

function note(watch: FloodWatch, extra: Partial<FloodInput> = {}) {
  nextId += 1;
  return watch.note({ chat: CHAT, user: 101, messageId: nextId, text: "hello", keys: [], sticker: null, strictness: "normal", exempt: false, now: NOW, ...extra });
}

/** `count` messages from one member, `gapMs` apart; the results in order. */
function burst(watch: FloodWatch, count: number, strictness: Strictness, gapMs = 500) {
  return Array.from({ length: count }, (_, i) => note(watch, { strictness, now: NOW + i * gapMs }));
}

describe("floods", () => {
  it.each([
    ["relaxed", 10],
    ["normal", 7],
    ["strict", 5],
    ["observe", 7],
  ] as const)("%s allows %i messages in 10 seconds", (strictness, limit) => {
    expect(floodLimit(strictness)).toBe(limit);
    const results = burst(new FloodWatch(), limit + 1, strictness);
    expect(results.slice(0, limit).every((r) => r.flood === null)).toBe(true);
    expect(results[limit].flood).toHaveLength(limit + 1);
  });

  it("reports a burst once, with every message in it", () => {
    const watch = new FloodWatch();
    const results = burst(watch, 10, "normal");
    const ids = results[7].flood;
    expect(ids).toHaveLength(8);
    expect(results.slice(8).every((r) => r.flood === null)).toBe(true);
  });

  it("doesn't count messages spread past 10 seconds, or other members' messages", () => {
    expect(burst(new FloodWatch(), 20, "strict", 2_100).every((r) => r.flood === null)).toBe(true);
    const watch = new FloodWatch();
    const results = Array.from({ length: 12 }, (_, i) => note(watch, { user: 200 + i, now: NOW + i * 100 }));
    expect(results.every((r) => r.flood === null)).toBe(true);
  });

  it("counts 5 identical stickers or GIFs in 30 seconds, not 4, and not different ones", () => {
    const watch = new FloodWatch();
    const same = Array.from({ length: 5 }, (_, i) => note(watch, { sticker: "AgADsticker", now: NOW + i * 5 * SEC }));
    expect(same.slice(0, 4).every((r) => r.flood === null)).toBe(true);
    expect(same[4].flood).toHaveLength(5);
    const mixed = new FloodWatch();
    expect(Array.from({ length: 6 }, (_, i) => note(mixed, { sticker: `AgAD${i}`, now: NOW + i * 5 * SEC })).every((r) => r.flood === null)).toBe(true);
  });
});

describe("link raids", () => {
  it("three new members posting the same severe link within 2 minutes are a raid: every copy, then each new one", () => {
    const watch = new FloodWatch();
    const key = ["pumpsignals.site"];
    const raider = { keys: key, severe: key, newcomer: true };
    expect(note(watch, { user: 1, ...raider }).linkRaid).toBeNull();
    expect(note(watch, { user: 2, ...raider, now: NOW + 30 * SEC }).linkRaid).toBeNull();
    const third = note(watch, { user: 3, ...raider, now: NOW + 60 * SEC }).linkRaid;
    expect(third?.map((c) => c.user)).toEqual([1, 2, 3]);
    const fourth = note(watch, { user: 4, ...raider, now: NOW + 70 * SEC }).linkRaid;
    expect(fourth?.map((c) => c.user)).toEqual([4]);
  });

  it("three accounts posting the same link are a raid for raid mode only, when they aren't new or the link is a plain one (rules#4)", () => {
    const members = new FloodWatch();
    const key = ["pumpsignals.site"];
    const seen = [1, 2, 3, 4].map((user, i) => note(members, { user, keys: key, severe: key, now: NOW + i * SEC }).linkRaid);
    expect(seen).toEqual([null, null, [], []]);
    const plain = new FloodWatch();
    expect([5, 6, 7].map((user, i) => note(plain, { user, keys: key, newcomer: true, now: NOW + i * SEC }).linkRaid)).toEqual([null, null, []]);
  });

  it("is not one account three times, nor copies more than 2 minutes apart", () => {
    const watch = new FloodWatch();
    for (let i = 0; i < 3; i++) expect(note(watch, { user: 1, keys: ["t.me/pumpgroup"], now: NOW + i * SEC }).linkRaid).toBeNull();
    const slow = new FloodWatch();
    for (let i = 0; i < 4; i++) expect(note(slow, { user: 10 + i, keys: ["t.me/pumpgroup"], now: NOW + i * 61 * SEC }).linkRaid).toBeNull();
  });

  it("never counts an @handle or a token address, whoever posts it (abuse#1)", () => {
    const watch = new FloodWatch();
    const sol = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
    for (let i = 0; i < 5; i++) {
      const keys = ["@alice_doe", "0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95", sol];
      expect(note(watch, { user: 20 + i, keys, now: NOW + i * SEC }).linkRaid).toBeNull();
    }
  });

  it("never counts a bot command's links: /check with a token link is no raid (abuse#1)", () => {
    const watch = new FloodWatch();
    for (const [i, text] of ["/check https://pump.fun/coin/abc", "/check@TonkfunBot https://pump.fun/coin/abc", "/check pump.fun/coin/abc"].entries()) {
      expect(note(watch, { user: 30 + i, text, keys: ["pump.fun/coin/abc"], now: NOW + i * SEC }).linkRaid).toBeNull();
    }
    expect(note(watch, { user: 40, text: "/check 0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95", keys: [], now: NOW + 5 * SEC }).linkRaid).toBeNull();
  });

  it("reports count toward raid mode, but are never returned as raiders, nor count toward the three (abuse#1, rules#4)", () => {
    const key = ["evil.xyz/claim"];
    const mixed = new FloodWatch();
    const raider = { keys: key, severe: key, newcomer: true };
    note(mixed, { user: 1, ...raider, exempt: true });
    note(mixed, { user: 2, ...raider, now: NOW + SEC });
    expect(note(mixed, { user: 3, ...raider, exempt: true, now: NOW + 2 * SEC }).linkRaid).toEqual([]);
    expect(note(mixed, { user: 4, ...raider, now: NOW + 3 * SEC }).linkRaid).toEqual([]);
    expect(note(mixed, { user: 5, ...raider, now: NOW + 4 * SEC }).linkRaid?.map((c) => c.user)).toEqual([2, 4, 5]);
    expect(note(mixed, { user: 6, ...raider, exempt: true, now: NOW + 5 * SEC }).linkRaid).toEqual([]);
    const reports = new FloodWatch();
    const seen = Array.from({ length: 3 }, (_, i) => note(reports, { user: 20 + i, keys: ["t.me/+AbC"], exempt: true, now: NOW + i * SEC }).linkRaid);
    expect(seen).toEqual([null, null, []]);
  });

  it("copy-pasted greetings are no raid; the same long text, even a question or a report, counts toward raid mode", () => {
    const watch = new FloodWatch();
    for (const [i, text] of ["good morning everyone", "good morning everyone", "good morning everyone"].entries()) {
      expect(note(watch, { user: 30 + i, text, now: NOW + i * SEC })).toMatchObject({ linkRaid: null, textRaid: false });
    }
    const asked = Array.from({ length: 8 }, (_, i) => note(watch, { user: 40 + i, text: "what is the contract address? is it on the docs page somewhere?", exempt: true, now: NOW + i * SEC }));
    expect(asked.slice(0, 7).some((r) => r.textRaid)).toBe(false);
    expect(asked[7].textRaid).toBe(true);
  });

  it("the same bot command from many accounts is no text raid", () => {
    const watch = new FloodWatch();
    const text = "/check 0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95";
    expect(Array.from({ length: 10 }, (_, i) => note(watch, { user: 60 + i, text, now: NOW + i * SEC })).some((r) => r.textRaid)).toBe(false);
  });
});

describe("text raids", () => {
  const spam = "🚀🚀 HUGE GEM launching now, 100x guaranteed, join the presale before it is gone!!";

  it("eight accounts with the same 40+ letter text set it, seven don't", () => {
    const watch = new FloodWatch();
    const results = Array.from({ length: 8 }, (_, i) => note(watch, { user: 50 + i, text: spam, now: NOW + i * 5 * SEC }));
    expect(results.slice(0, 7).every((r) => !r.textRaid)).toBe(true);
    expect(results[7].textRaid).toBe(true);
  });

  it("reads past case, spacing and emoji, but not past 2 minutes", () => {
    const watch = new FloodWatch();
    const variants = [spam, spam.toUpperCase(), spam.replace(/ /g, "  "), spam.replace(/🚀/g, "")];
    const results = Array.from({ length: 8 }, (_, i) => note(watch, { user: 60 + i, text: variants[i % 4], now: NOW + i * SEC }));
    expect(results[7].textRaid).toBe(true);
    const slow = new FloodWatch();
    expect(Array.from({ length: 8 }, (_, i) => note(slow, { user: 70 + i, text: spam, now: NOW + i * 20 * SEC })).some((r) => r.textRaid)).toBe(false);
  });

  it("a pasted token address is no text raid, however many paste it; the words around one still count (abuse#1)", () => {
    const sol = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
    for (const ca of ["0xFD42E33D5D3A8B04ED95F43E9453F7B17B23CD95", sol, `CA: ${sol} ${sol}`]) {
      const watch = new FloodWatch();
      expect(Array.from({ length: 12 }, (_, i) => note(watch, { user: 80 + i, text: ca, now: NOW + i * SEC })).some((r) => r.textRaid)).toBe(false);
    }
    const shill = new FloodWatch();
    expect(Array.from({ length: 8 }, (_, i) => note(shill, { user: 90 + i, text: `${spam} ${sol}`, now: NOW + i * SEC }))[7].textRaid).toBe(true);
  });

  it("prune keeps the senders of the last 2 minutes and forgets the rest", () => {
    const watch = new FloodWatch();
    for (let i = 0; i < 7; i++) note(watch, { user: 100 + i, text: spam, now: NOW + i * SEC });
    watch.prune(NOW + MIN);
    expect(note(watch, { user: 120, text: spam, now: NOW + MIN }).textRaid).toBe(true);
    watch.prune(NOW + 3 * MIN + 1);
    expect(note(watch, { user: 121, text: spam, now: NOW + 3 * MIN + 1 }).textRaid).toBe(false);
  });
});

describe("memory", () => {
  it("recent() gives a member's last 10 minutes, at most 20", () => {
    const watch = new FloodWatch();
    const ids = Array.from({ length: 25 }, (_, i) => {
      nextId += 1;
      watch.note({ chat: CHAT, user: 7, messageId: nextId, text: "x", keys: [], sticker: null, strictness: "relaxed", exempt: false, now: NOW + i * 20 * SEC });
      return nextId;
    });
    const last = NOW + 24 * 20 * SEC;
    expect(watch.recent(CHAT, 7, last)).toEqual(ids.slice(-20));
    expect(watch.recent(CHAT, 7, last + 10 * MIN)).toEqual([]);
    expect(watch.recent(CHAT, 8, last)).toEqual([]);
  });

  it("prune forgets everything within 10 minutes", () => {
    const watch = new FloodWatch();
    note(watch, { user: 1, keys: ["evil.xyz"] });
    note(watch, { user: 2, keys: ["evil.xyz"] });
    watch.prune(NOW + 10 * MIN);
    expect(watch.recent(CHAT, 1, NOW + 10 * MIN)).toEqual([]);
    expect(note(watch, { user: 3, keys: ["evil.xyz"], now: NOW + 10 * MIN }).linkRaid).toBeNull();
  });
});
