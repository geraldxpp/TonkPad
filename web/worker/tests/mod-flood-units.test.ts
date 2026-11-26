// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type FloodInput, FloodWatch } from "../src/telegram/mod/flood";
import { NOW, SEC } from "./fixtures";

const CHAT = -1001234567890;
let nextId = 50_000;

function note(watch: FloodWatch, extra: Partial<FloodInput> = {}) {
  nextId += 1;
  return watch.note({ chat: CHAT, user: 101, messageId: nextId, text: "hello", keys: [], sticker: null, strictness: "normal", exempt: false, now: NOW, ...extra });
}

/** rules#6: albums and forward bursts count by their size, and a long burst floods however it is grouped. */
describe("albums and forward bursts count ceil(n/5) units (rules#6)", () => {
  it("63 forwards in 3 bursts of 21 within 22 seconds flood, and the rest of the burst is deleted as it arrives", () => {
    const watch = new FloodWatch();
    const results = [0, 10, 21].flatMap((sec) => Array.from({ length: 21 }, () => note(watch, { forwardedAt: Math.floor(NOW / 1000) + sec, now: NOW + sec * SEC })));
    const first = results.findIndex((r) => r.flood !== null);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(21);
    expect(results[first].flood).toHaveLength(first + 1);
    // Every forward after the flood, in the same 10 seconds, is deleted with it (no second offence).
    expect(results.slice(first + 1, 21).every((r) => r.flood === null && r.rest === true)).toBe(true);
  });

  it("40 photos as 4 albums of 10 within 16 seconds flood", () => {
    const watch = new FloodWatch();
    const results = [0, 5, 10, 16].flatMap((sec, a) => Array.from({ length: 10 }, () => note(watch, { album: `album${a}`, now: NOW + sec * SEC })));
    expect(results.some((r) => r.flood !== null)).toBe(true);
  });

  it("one album of 8, one of 10, or 9 forwards at once is no flood; an album of 8 counts as 2", () => {
    expect(Array.from({ length: 8 }, () => note(new FloodWatch(), { album: "a8" })).every((r) => r.flood === null)).toBe(true);
    const ten = new FloodWatch();
    expect(Array.from({ length: 10 }, () => note(ten, { album: "a10" })).every((r) => r.flood === null)).toBe(true);
    const nine = new FloodWatch();
    expect(Array.from({ length: 9 }, () => note(nine, { forwardedAt: 1_700_000_000 })).every((r) => r.flood === null)).toBe(true);
    // Strict allows 5: an album of 6 is 2 units, so 4 more messages make 6 (as one unit, it would have been 5).
    const mixed = new FloodWatch();
    expect(Array.from({ length: 6 }, () => note(mixed, { album: "m6", strictness: "strict" })).every((r) => r.flood === null)).toBe(true);
    const singles = Array.from({ length: 4 }, (_, i) => note(mixed, { strictness: "strict", now: NOW + (i + 1) * SEC }));
    expect(singles.slice(0, 3).every((r) => r.flood === null)).toBe(true);
    expect(singles[3].flood).toHaveLength(10);
  });

  it("more than 4 times the limit within 60 seconds is a flood, however grouped", () => {
    const watch = new FloodWatch();
    // Normal: 7 a burst every 11 seconds never floods within 10 seconds, but the 29th message in a minute does.
    const results = Array.from({ length: 30 }, (_, i) => note(watch, { now: NOW + Math.floor(i / 7) * 11 * SEC + (i % 7) * 100 }));
    const first = results.findIndex((r) => r.flood !== null);
    expect(first).toBe(28);
  });
});

/** rules#10: an edit is no new message for the flood limit; edit spam has its own. */
describe("edits never count as new flood units (rules#10)", () => {
  it("strict: 3 messages and 3 typo edits in 7 seconds are no flood", () => {
    const watch = new FloodWatch();
    const ids = [1, 2, 3].map((i) => {
      note(watch, { strictness: "strict", now: NOW + i * SEC });
      return nextId;
    });
    const edits = ids.map((id, i) => watch.note({ chat: CHAT, user: 101, messageId: id, text: "fixed", keys: [], sticker: null, strictness: "strict", exempt: false, edit: true, now: NOW + (4 + i) * SEC }));
    expect(edits.every((r) => r.flood === null)).toBe(true);
  });

  it("normal: 4 messages and 4 typo edits are no flood, and each message is still deleted once by a later flood", () => {
    const watch = new FloodWatch();
    const ids = [0, 1, 2, 3].map((i) => {
      note(watch, { now: NOW + i * SEC });
      return nextId;
    });
    for (const [i, id] of ids.entries()) expect(watch.note({ chat: CHAT, user: 101, messageId: id, text: "x", keys: [], sticker: null, strictness: "normal", exempt: false, edit: true, now: NOW + 4 * SEC + i * 100 }).flood).toBeNull();
    const more = Array.from({ length: 4 }, (_, i) => note(watch, { now: NOW + 5 * SEC + i * 100 }));
    expect(more[3].flood).toEqual([...ids, ...more.map((_, i) => ids[3] + 1 + i)]);
  });

  it("more than 10 edits by one member in 10 seconds is a flood", () => {
    const watch = new FloodWatch();
    note(watch, { now: NOW });
    const id = nextId;
    const edits = Array.from({ length: 11 }, (_, i) => watch.note({ chat: CHAT, user: 101, messageId: id, text: `x${i}`, keys: [], sticker: null, strictness: "normal", exempt: false, edit: true, now: NOW + (i + 1) * 500 }));
    expect(edits.slice(0, 10).every((r) => r.flood === null)).toBe(true);
    expect(edits[10].flood).toEqual([id]);
  });

  it("an edit still feeds the raid counts for its keys", () => {
    const watch = new FloodWatch();
    const key = ["evil[.]xyz"];
    note(watch, { user: 1, keys: [] });
    const edited = nextId;
    note(watch, { user: 2, keys: key });
    expect(watch.note({ chat: CHAT, user: 1, messageId: edited, text: "evil[.]xyz", keys: key, sticker: null, strictness: "normal", exempt: false, edit: true, now: NOW + SEC }).linkRaid).toBeNull();
    expect(note(watch, { user: 3, keys: key, now: NOW + 2 * SEC }).linkRaid).not.toBeNull();
  });
});
