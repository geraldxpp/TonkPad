// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GROUP_ID, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";
import { burstBench, isKick, isMute, isTextOnly } from "./mod-newcomers-bench";

/**
 * The reviewers' raids, on the production pieces (records, telegram-out,
 * Sender, members.ts) over a fake Telegram: when each raider was first
 * restricted, whether anyone was let in without passing, and what the
 * Sender spent its 25 a second on.
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

type Bench = ReturnType<typeof burstBench>;

/** For each joiner: how long after joining they were first restricted (no sending), and whether they were removed, or let in text only. */
function outcome(bench: Bench) {
  const firstMute = new Map<number, number>();
  const kicked = new Set<number>();
  const textOnly = new Set<number>();
  for (const c of bench.calls) {
    const user = Number(c.params.user_id);
    if (isMute(c) && !firstMute.has(user)) firstMute.set(user, c.at);
    if (isKick(c)) kicked.add(user);
    if (isTextOnly(c)) textOnly.add(user);
  }
  const delays = bench.joined.map(({ user, at }) => (firstMute.get(user) ?? Number.POSITIVE_INFINITY) - at);
  return { delays, maxDelay: Math.max(...delays), kicked, textOnly, unchecked: bench.alerts.filter((a) => a.done === testWords.admin.checkFailed).length };
}

describe("a join raid on the new-member check", () => {
  it("restricts every raider at once when Telegram hands over each joined message before its update: 1,200 at 20 a second, in raid mode", async () => {
    const bench = burstBench({ raid: true, latencyMs: 150 });
    for (let i = 0; i < 1_200; i += 1) bench.joinBoth(i * 50, 10_000 + i, "message", 100);
    await vi.advanceTimersByTimeAsync(8 * MINUTE);
    bench.stop();
    const o = outcome(bench);
    // Before: 543 first restricted more than 30 s after joining (61.4 s at most), 1,200 reads, 400 let in unchecked.
    expect(o.maxDelay).toBeLessThan(2 * SECOND);
    expect(bench.of("getChatMember")).toHaveLength(0);
    expect(o.textOnly.size).toBe(0);
    expect(o.unchecked).toBe(0);
    expect(o.kicked.size).toBe(1_200);
    expect(bench.records.pendingIn(GROUP_ID)).toEqual([]);
    expect(bench.longestTick()).toBeLessThan(SECOND);
  }, 60_000);

  it("still restricts every raider at once when their updates never come, reading each one only after, behind the restrictions", async () => {
    const bench = burstBench({ raid: true, latencyMs: 150 });
    for (let i = 0; i < 600; i += 1) bench.joinBoth(i * 50, 20_000 + i, "message", null);
    await vi.advanceTimersByTimeAsync(8 * MINUTE);
    bench.stop();
    const o = outcome(bench);
    expect(o.maxDelay).toBeLessThan(2 * SECOND);
    // Each read went out after that joiner's restriction, never before it.
    const muted = new Map(bench.calls.filter(isMute).map((c) => [Number(c.params.user_id), c.at] as const));
    expect(bench.of("getChatMember").every((c) => c.at >= (muted.get(Number(c.params.user_id)) ?? Number.POSITIVE_INFINITY))).toBe(true);
    expect(o.textOnly.size).toBe(0);
    expect(o.kicked.size).toBe(600);
  }, 60_000);

  it("keeps restricting joiners at once through a press flood, answering a few presses a second and none past each one's limit", async () => {
    const bench = burstBench({ raid: true, latencyMs: 150 });
    // 20 accounts, not on any check, tap twice a second for a minute.
    for (let n = 0; n < 120; n += 1) for (let f = 0; f < 20; f += 1) bench.tapAt(n * 500, 30_000 + f, n);
    // 150 people join from 20 seconds on; one of them, a human, taps their own check.
    for (let i = 0; i < 150; i += 1) bench.joinBoth(20 * SECOND + i * 200, 40_000 + i, "update", 50);
    bench.pressAt(40 * SECOND, 40_010);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    bench.stop();
    const o = outcome(bench);
    // Before: 2,400 answers, the check out 70 s after its first joiner, 119 of 149 restricted more than 10 s late (60.4 s at most).
    expect(o.maxDelay).toBeLessThan(2 * SECOND);
    const firstCheck = bench.of("sendMessage").find((c) => String(c.params.text).includes("Tap the button"));
    expect((firstCheck?.at ?? Number.POSITIVE_INFINITY) - (NOW + 20 * SECOND)).toBeLessThan(5 * SECOND);
    const flood = bench.of("answerCallbackQuery").filter((c) => String(c.params.callback_query_id).startsWith("f"));
    expect(flood.length).toBeLessThanOrEqual(3 * 60 + 3);
    const human = bench.of("answerCallbackQuery").find((c) => String(c.params.callback_query_id).startsWith("q40010:"));
    expect(human?.params.text).toBe(testWords.check.passed);
    expect(o.textOnly).toEqual(new Set([40_010]));
  }, 60_000);

  it("checks every raider of a sustained raid, 12 joins a second for 5 minutes: none let in unchecked, three checks a minute throughout", async () => {
    const bench = burstBench({ raid: true, latencyMs: 150 });
    for (let i = 0; i < 3_600; i += 1) bench.joinBoth(Math.floor((i * SECOND) / 12), 100_000 + i, "update", 50);
    await vi.advanceTimersByTimeAsync(12 * MINUTE);
    bench.stop();
    const o = outcome(bench);
    // Before: 720 let in text only without a check, check sends falling from 3 a minute to 1 once removals began, 20 calls dropped.
    expect(o.textOnly.size).toBe(0);
    expect(o.unchecked).toBe(0);
    expect(o.kicked.size).toBe(3_600);
    expect(o.maxDelay).toBeLessThanOrEqual(3 * SECOND);
    const perMinute = [0, 0, 0, 0, 0];
    for (const c of bench.of("sendMessage")) if (String(c.params.text).includes("Tap the button")) perMinute[Math.floor((c.at - NOW) / MINUTE)] += 1;
    expect(perMinute).toEqual([3, 3, 3, 3, 3]);
    expect(bench.records.pendingIn(GROUP_ID)).toEqual([]);
  }, 60_000);

  it("keeps a raid's joiners restricted while Telegram refuses the group's messages for 2 minutes, then checks and removes them", async () => {
    const bench = burstBench({ raid: true, latencyMs: 150 });
    bench.tg.blockSends(NOW + 2 * MINUTE);
    for (let i = 0; i < 600; i += 1) bench.joinBoth(i * 100, 60_000 + i, "update", 50);
    bench.pressAt(2 * MINUTE + 30 * SECOND, 60_005);
    await vi.advanceTimersByTimeAsync(12 * MINUTE);
    bench.stop();
    const o = outcome(bench);
    // Before: a check that couldn't go out twice let everyone on it in text only, unchecked.
    expect(o.unchecked).toBe(0);
    expect(o.textOnly).toEqual(new Set([60_005]));
    expect(o.kicked.size).toBe(599);
    expect(bench.of("sendMessage").filter((c) => c.at < NOW + 2 * MINUTE).length).toBeGreaterThan(0);
    // Nobody was free before their check went out: each was removed only after their own time on a posted check.
    const posted = Math.min(...bench.of("sendMessage").filter((c) => c.at >= NOW + 2 * MINUTE).map((c) => c.at));
    const kicks = bench.calls.filter(isKick).map((c) => c.at);
    expect(Math.min(...kicks)).toBeGreaterThanOrEqual(posted + 3 * MINUTE);
    expect(bench.records.pendingIn(GROUP_ID)).toEqual([]);
  }, 60_000);

  it("answers a single account's 120 taps in a second at most 3 times, and the next joiner is restricted at once", async () => {
    const bench = burstBench({ latencyMs: 150 });
    bench.joinBoth(0, 50_000, "update", 50);
    for (let n = 0; n < 120; n += 1) bench.tapAt(2 * SECOND + n * 8, 50_001, n);
    bench.joinBoth(2_500, 50_002, "update", 50);
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    bench.stop();
    expect(bench.of("answerCallbackQuery")).toHaveLength(3);
    expect(outcome(bench).delays[1]).toBeLessThan(300);
  });
});
