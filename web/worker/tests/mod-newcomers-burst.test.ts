// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GROUP_ID, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";
import { burstBench, isKick, isMute, isTextOnly, type Joined } from "./mod-newcomers-bench";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/** When each user was first restricted with no sending, and removed, after joining. */
function delays(bench: ReturnType<typeof burstBench>, joined: readonly Joined[]) {
  const first = (test: (c: (typeof bench.calls)[number]) => boolean, user: number) => bench.calls.find((c) => test(c) && Number(c.params.user_id) === user)?.at;
  return joined.map(({ user, at }) => ({ user, restricted: (first(isMute, user) ?? Infinity) - at, removed: (first(isKick, user) ?? Infinity) - at }));
}

describe("the new-member check in a join burst", () => {
  it("restricts each of 150 joiners at once, removes every one who doesn't tap by their deadline, and lets in the one who taps", async () => {
    const bench = burstBench({ latencyMs: 100 });
    const tapper = 1_120;
    for (let i = 0; i < 150; i += 1) bench.joinAt(i * 100, 1_000 + i);
    bench.pressAt(72 * SECOND, tapper);
    await vi.advanceTimersByTimeAsync(12 * MINUTE);
    bench.stop();

    const each = delays(bench, bench.joined);
    expect(each).toHaveLength(150);
    // Restricted as the join arrived: never behind the check's edits.
    expect(Math.max(...each.map((d) => d.restricted))).toBeLessThan(2 * SECOND);
    // Removed at their deadline (5 minutes from when they were put on the check), well before their restriction ends.
    const others = each.filter((d) => d.user !== tapper);
    expect(others.filter((d) => d.removed === Infinity).map((d) => d.user)).toEqual([]);
    expect(Math.max(...others.map((d) => d.removed))).toBeLessThan(5 * MINUTE + 30 * SECOND);
    expect(Math.min(...others.map((d) => d.removed))).toBeGreaterThanOrEqual(5 * MINUTE);

    // The tapper's press was answered at once, and they were let in, text only, and never removed.
    const press = bench.pressed[0].at;
    const answer = bench.of("answerCallbackQuery").find((c) => String(c.params.callback_query_id).startsWith(`q${tapper}:`));
    expect(answer?.params.text).toBe(testWords.check.passed);
    expect((answer?.at ?? Infinity) - press).toBeLessThan(SECOND);
    expect(bench.calls.some((c) => isTextOnly(c) && Number(c.params.user_id) === tapper)).toBe(true);
    expect(bench.calls.some((c) => isKick(c) && Number(c.params.user_id) === tapper)).toBe(false);
    expect(bench.records.isNewcomer(GROUP_ID, tapper, Date.now())).toBe(true);

    // Nothing is left pending, and every check message went with its last newcomer.
    expect(bench.records.duePending(Number.MAX_SAFE_INTEGER)).toEqual([]);
    // Telegram numbers the bot's messages from 701, in the order they were sent.
    const posted = bench.of("sendMessage").flatMap((c, i) => (String(c.params.text).includes("Tap the button") ? [701 + i] : []));
    const deleted = new Set(bench.of("deleteMessages").flatMap((c) => c.params.message_ids as number[]));
    expect(posted.length).toBeGreaterThan(0);
    for (const id of posted) expect(deleted.has(id)).toBe(true);
    // The 5-second tick never waits on Telegram.
    expect(bench.longestTick()).toBeLessThan(SECOND);
  });

  it("in raid mode removes all 100 of a burst of joiners who never tap (the hard check, 3 minutes)", async () => {
    const bench = burstBench({ raid: true, latencyMs: 100 });
    for (let i = 0; i < 100; i += 1) bench.joinAt(i * 250, 2_000 + i);
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    bench.stop();

    const each = delays(bench, bench.joined);
    expect(each.filter((d) => d.removed === Infinity).map((d) => d.user)).toEqual([]);
    expect(Math.max(...each.map((d) => d.removed))).toBeLessThan(3 * MINUTE + 30 * SECOND);
    expect(Math.max(...each.map((d) => d.restricted))).toBeLessThan(2 * SECOND);
    expect(bench.records.duePending(Number.MAX_SAFE_INTEGER)).toEqual([]);
    expect(bench.longestTick()).toBeLessThan(SECOND);
  });

  it("edits the shared check at most once per group gap, and answers a tap within a second while the burst goes on", async () => {
    const bench = burstBench({ latencyMs: 100 });
    for (let i = 0; i < 100; i += 1) bench.joinAt(i * 250, 3_000 + i);
    // Joined at 10 s; taps 8 seconds later, in the middle of the burst.
    bench.pressAt(18 * SECOND, 3_040);
    await vi.advanceTimersByTimeAsync(40 * SECOND);
    bench.stop();

    const edits = bench.of("editMessageText").map((c) => c.at);
    for (let i = 1; i < edits.length; i += 1) expect(edits[i] - edits[i - 1]).toBeGreaterThanOrEqual(3 * SECOND);
    const answer = bench.of("answerCallbackQuery").find((c) => String(c.params.callback_query_id).startsWith("q3040:"));
    expect(answer?.params.text).toBe(testWords.check.passed);
    expect((answer?.at ?? Infinity) - bench.pressed[0].at).toBeLessThan(SECOND);
  });
});
