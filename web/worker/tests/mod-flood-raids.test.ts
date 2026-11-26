// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type FloodInput, FloodWatch } from "../src/telegram/mod/flood";
import { NOW, SEC } from "./fixtures";

const CHAT = -1001234567890;
let nextId = 70_000;

function note(watch: FloodWatch, extra: Partial<FloodInput> = {}) {
  nextId += 1;
  return watch.note({ chat: CHAT, user: 101, messageId: nextId, text: "hello", keys: [], sticker: null, strictness: "normal", exempt: false, now: NOW, ...extra });
}

const CHART = "dexscreener.com/solana/abc123";
const INVITE = "t.me/+AbCdEf123";

/** rules#4: a raid can never be aimed at a member or a newcomer. */
describe("only new members' copies of a risky link make raiders (rules#4)", () => {
  it("framing: a newcomer's chart, then two members' copies, starts raid mode but makes nobody a raider", () => {
    const watch = new FloodWatch();
    expect(note(watch, { user: 741, keys: [CHART], newcomer: true }).linkRaid).toBeNull();
    expect(note(watch, { user: 948, keys: [CHART], now: NOW + 30 * SEC }).linkRaid).toBeNull();
    expect(note(watch, { user: 949, keys: [CHART], now: NOW + 31 * SEC }).linkRaid).toEqual([]);
  });

  it("framing with a severe link: two members' copies never make a newcomer's copy a raider's", () => {
    const watch = new FloodWatch();
    note(watch, { user: 741, keys: [INVITE], severe: [INVITE], newcomer: true });
    note(watch, { user: 948, keys: [INVITE], severe: [INVITE], now: NOW + 30 * SEC });
    expect(note(watch, { user: 949, keys: [INVITE], severe: [INVITE], now: NOW + 31 * SEC }).linkRaid).toEqual([]);
  });

  it("launch day: three newcomers share one KOL tweet, a plain unknown link: raid mode, nobody a raider", () => {
    const watch = new FloodWatch();
    const tweet = "x.com/blknoiz06/status/1861234567890";
    const results = [751, 752, 753].map((user, i) => note(watch, { user, keys: [tweet], newcomer: true, now: NOW + i * 20 * SEC }));
    expect(results.map((r) => r.linkRaid)).toEqual([null, null, []]);
  });

  it("three newcomers posting one severe link are raiders: every copy at the third, then each new one", () => {
    const watch = new FloodWatch();
    const results = [801, 802, 803, 804].map((user, i) => note(watch, { user, keys: [INVITE], severe: [INVITE], newcomer: true, now: NOW + i * 5 * SEC }));
    expect(results[1].linkRaid).toBeNull();
    expect(results[2].linkRaid?.map((c) => c.user)).toEqual([801, 802, 803]);
    expect(results[3].linkRaid?.map((c) => c.user)).toEqual([804]);
  });

  it("members' copies count toward raid mode, never toward the newcomers' three", () => {
    const watch = new FloodWatch();
    note(watch, { user: 811, keys: [INVITE], severe: [INVITE], newcomer: true });
    note(watch, { user: 812, keys: [INVITE], severe: [INVITE], newcomer: true, now: NOW + SEC });
    expect(note(watch, { user: 901, keys: [INVITE], severe: [INVITE], now: NOW + 2 * SEC }).linkRaid).toEqual([]);
    expect(note(watch, { user: 813, keys: [INVITE], severe: [INVITE], newcomer: true, now: NOW + 3 * SEC }).linkRaid?.map((c) => c.user)).toEqual([811, 812, 813]);
  });

  it("a newcomer's report counts toward raid mode, never as a raider", () => {
    const watch = new FloodWatch();
    note(watch, { user: 821, keys: [INVITE], severe: [INVITE], newcomer: true });
    note(watch, { user: 822, keys: [INVITE], severe: [INVITE], newcomer: true, exempt: true, now: NOW + SEC });
    expect(note(watch, { user: 823, keys: [INVITE], severe: [INVITE], newcomer: true, now: NOW + 2 * SEC }).linkRaid).toEqual([]);
  });
});
