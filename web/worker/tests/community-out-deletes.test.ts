import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramError } from "../src/telegram/api";
import { createRecords } from "../src/telegram/community/records";
import { emptyCommunityState } from "../src/telegram/community/state";
import { ADMIN_CHAT_ID, GROUP_ID } from "./community-fixtures";
import { outBench } from "./community-out-fixtures";
import { MIN, NOW, SEC } from "./fixtures";

/**
 * Deletes are kept until Telegram confirms them (robustness#7), and a
 * batch still waiting at a stop is written down for the next start
 * (telegram#7).
 */

const HOUR = 60 * MIN;
const badGateway = () => new TelegramError(502, "Bad Gateway", null);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/** The IDs each deleteMessages call carried, in order. */
const sentIds = (calls: ReadonlyArray<{ method: string; params: Record<string, unknown> }>) =>
  calls.filter((c) => c.method === "deleteMessages").map((c) => c.params.message_ids as number[]);

describe("createTelegramOut: deletes Telegram refused", () => {
  it("keeps a removal whose deleteMessages failed and sends it again once its retry is due", async () => {
    let fails = 1;
    const { out, calls, records } = outBench({ refuse: (method) => (method === "deleteMessages" && fails-- > 0 ? badGateway() : null) });
    out.remove(GROUP_ID, [11]);
    await vi.advanceTimersByTimeAsync(300);
    expect(sentIds(calls)).toEqual([[11]]);
    expect(records.dueDeletes(Date.now() + 30 * SEC)).toEqual([{ chat: GROUP_ID, messageId: 11 }]);
    // Not before its retry time.
    await out.tick(Date.now());
    await vi.advanceTimersByTimeAsync(300);
    expect(sentIds(calls)).toEqual([[11]]);
    await vi.advanceTimersByTimeAsync(30 * SEC);
    await out.tick(Date.now());
    await vi.advanceTimersByTimeAsync(300);
    expect(sentIds(calls)).toEqual([[11], [11]]);
    expect(records.dueDeletes(Date.now() + 48 * HOUR)).toEqual([]);
  });

  it("tries a notice and a routine alert again, backing off, while Telegram is down, and deletes them once it is back", async () => {
    let down = true;
    const { out, calls, records } = outBench({ refuse: (method) => (method === "deleteMessages" && down ? badGateway() : null) });
    out.removeLater(GROUP_ID, 78, 60 * SEC);
    out.removeLater(ADMIN_CHAT_ID, 77, 47 * HOUR);
    for (let minute = 1; minute <= 60; minute += 1) {
      await vi.advanceTimersByTimeAsync(MIN);
      await out.tick(Date.now());
    }
    const tries = sentIds(calls).filter((ids) => ids.includes(78)).length;
    // 30 s, then twice as long each time: about 7 tries in the hour, not one every tick.
    expect(tries).toBeGreaterThanOrEqual(5);
    expect(tries).toBeLessThanOrEqual(8);
    down = false;
    for (let minute = 1; minute <= 30; minute += 1) {
      await vi.advanceTimersByTimeAsync(MIN);
      await out.tick(Date.now());
    }
    await vi.advanceTimersByTimeAsync(300);
    expect(sentIds(calls).filter((ids) => ids.includes(78))).toHaveLength(tries + 1);
    expect(records.dueDeletes(Date.now() + HOUR)).toEqual([]);
    // The routine alert, 47 hours on: deleted on its first try.
    await vi.advanceTimersByTimeAsync(47 * HOUR);
    await out.tick(Date.now());
    await vi.advanceTimersByTimeAsync(300);
    expect(calls.filter((c) => c.method === "deleteMessages" && c.params.chat_id === ADMIN_CHAT_ID).map((c) => c.params.message_ids)).toEqual([[77]]);
    expect(records.dueDeletes(Date.now() + 48 * HOUR)).toEqual([]);
  });

  it("gives up when Telegram's 48 hours are over, as the records do", async () => {
    const records = createRecords(emptyCommunityState(), { persist: () => undefined, defaults: () => ({ paused: false, proactive: true, strictness: "observe", raidUntil: 0 }), now: () => Date.now() });
    const { out, calls } = outBench({ records, refuse: (method) => (method === "deleteMessages" ? badGateway() : null) });
    out.remove(GROUP_ID, [5]);
    await vi.advanceTimersByTimeAsync(300);
    for (let hour = 1; hour <= 48; hour += 1) {
      for (let half = 0; half < 2; half += 1) {
        await vi.advanceTimersByTimeAsync(30 * MIN);
        await out.tick(Date.now());
      }
    }
    const before = sentIds(calls).length;
    expect(before).toBeGreaterThan(48);
    for (let hour = 1; hour <= 6; hour += 1) {
      await vi.advanceTimersByTimeAsync(HOUR);
      await out.tick(Date.now());
      records.prune(Date.now());
    }
    await vi.advanceTimersByTimeAsync(300);
    expect(sentIds(calls)).toHaveLength(before);
  });
});

describe("createTelegramOut: deletes at a stop", () => {
  it("writes a batch still waiting to the records as due now, and sends it too, so a call cut off by the exit is made at the next start", async () => {
    // The worker exits before Telegram answers: the call never settles.
    const first = outBench({ answer: (method) => (method === "deleteMessages" ? new Promise<never>(() => undefined) : undefined) });
    first.out.remove(GROUP_ID, [91, 92]);
    first.out.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(sentIds(first.calls)).toEqual([[91, 92]]);
    expect(first.records.dueDeletes(Date.now())).toEqual([{ chat: GROUP_ID, messageId: 91 }, { chat: GROUP_ID, messageId: 92 }]);
    const second = outBench({ records: first.records });
    await second.out.tick(Date.now());
    await vi.advanceTimersByTimeAsync(300);
    expect(sentIds(second.calls)).toEqual([[91, 92]]);
    expect(second.records.dueDeletes(Date.now() + 48 * HOUR)).toEqual([]);
  });
});
