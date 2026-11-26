// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type FloodInput, FloodWatch } from "../src/telegram/mod/flood";
import { NOW, SEC } from "./fixtures";

const CHAT = -1001234567890;
let nextId = 1;

function note(watch: FloodWatch, extra: Partial<FloodInput> = {}) {
  nextId += 1;
  return watch.note({ chat: CHAT, user: 101, messageId: nextId, text: "hello", keys: [], sticker: null, strictness: "normal", exempt: false, now: NOW, ...extra });
}

describe("albums and forward bursts count as one message for every 5 (abuse#8, rules#6)", () => {
  it("an album of 8 photos is no flood in normal mode, nor one of 6 in strict", () => {
    const normal = new FloodWatch();
    expect(Array.from({ length: 8 }, () => note(normal, { album: "13579" })).every((r) => r.flood === null)).toBe(true);
    const strict = new FloodWatch();
    expect(Array.from({ length: 6 }, () => note(strict, { album: "24680", strictness: "strict" })).every((r) => r.flood === null)).toBe(true);
  });

  it("forwarding several messages at once is no flood; forwards in different seconds count apart", () => {
    const watch = new FloodWatch();
    const at = Math.floor(NOW / 1000);
    expect(Array.from({ length: 9 }, () => note(watch, { forwardedAt: at })).every((r) => r.flood === null)).toBe(true);
    const spread = new FloodWatch();
    const results = Array.from({ length: 8 }, (_, i) => note(spread, { forwardedAt: at + i, now: NOW + i * SEC }));
    expect(results[7].flood).toHaveLength(8);
  });

  it("counts albums and bursts as messages, so many of them still flood", () => {
    const watch = new FloodWatch();
    const results = Array.from({ length: 8 }, (_, i) => note(watch, { album: `album${i}`, now: NOW + i * SEC }));
    expect(results.slice(0, 7).every((r) => r.flood === null)).toBe(true);
    expect(results[7].flood).toHaveLength(8);
  });

  it("past twice the limit in 10 seconds is a flood however the messages are grouped, and the rest of the burst goes with it", () => {
    const watch = new FloodWatch();
    const at = Math.floor(NOW / 1000);
    const results = Array.from({ length: 22 }, () => note(watch, { forwardedAt: at }));
    expect(results.slice(0, 14).every((r) => r.flood === null && !r.rest)).toBe(true);
    expect(results[14].flood).toHaveLength(15);
    expect(results.slice(15).every((r) => r.flood === null && r.rest)).toBe(true);
  });

  it("five identical stickers forwarded at once are one, five sent apart are a flood", () => {
    const at = Math.floor(NOW / 1000);
    const once = new FloodWatch();
    expect(Array.from({ length: 5 }, () => note(once, { sticker: "AgADsticker", forwardedAt: at })).every((r) => r.flood === null)).toBe(true);
    const apart = new FloodWatch();
    expect(Array.from({ length: 5 }, (_, i) => note(apart, { sticker: "AgADsticker", now: NOW + i * 5 * SEC }))[4].flood).toHaveLength(5);
  });

  it("counts and deletes each message once, even when one is noted twice (rules#10)", () => {
    const watch = new FloodWatch();
    const results = Array.from({ length: 8 }, (_, i) => watch.note({ chat: CHAT, user: 909, messageId: 5_000 + Math.min(i, 6), text: "x", keys: [], sticker: null, strictness: "normal", exempt: false, now: NOW + i * 100 }));
    expect(results.every((r) => r.flood === null)).toBe(true);
    const eighth = watch.note({ chat: CHAT, user: 909, messageId: 5_007, text: "x", keys: [], sticker: null, strictness: "normal", exempt: false, now: NOW + 900 });
    expect(eighth.flood).toEqual([5_000, 5_001, 5_002, 5_003, 5_004, 5_005, 5_006, 5_007]);
    expect(watch.recent(CHAT, 909, NOW + SEC)).toEqual([5_000, 5_001, 5_002, 5_003, 5_004, 5_005, 5_006, 5_007]);
  });
});
