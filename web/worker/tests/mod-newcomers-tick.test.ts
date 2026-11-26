import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecords } from "../src/telegram/community/records";
import { emptyCommunityState } from "../src/telegram/community/state";
import type { ChatSettings, PendingCheck } from "../src/telegram/community/types";
import { callsOf, GROUP_ID, memoryRecords } from "./community-fixtures";
import { NOW } from "./fixtures";
import { MINUTE, person, press, SECOND, setup } from "./mod-newcomers-setup";

const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const due = (user: number, extra: Partial<PendingCheck> = {}): PendingCheck =>
  ({ chat: GROUP_ID, user, messageId: 4444, joinMessageId: null, deadline: NOW - SECOND, target: null, tries: 0, ...extra });
const defaults = (): ChatSettings => ({ paused: false, proactive: true, strictness: "normal", raidUntil: 0 });

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the new-member check's tick", () => {
  it("never waits for Telegram: it queues each due check's removal and returns, and queues each one once", async () => {
    const records = memoryRecords({ strictness: "normal" });
    for (let i = 0; i < 20; i += 1) records.setPending(due(300 + i));
    // Each removal takes a minute to come back.
    const { out, newcomers } = setup({ out: { kick: () => after(MINUTE, true) } }, records);
    let returned = false;
    void newcomers.tick(NOW).then(() => (returned = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(returned).toBe(true);
    expect(callsOf(out.log, "kick")).toHaveLength(20);
    // Ticks while those removals are still under way don't queue them again.
    await newcomers.tick(NOW + 5 * SECOND);
    await newcomers.tick(NOW + 10 * SECOND);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(callsOf(out.log, "kick")).toHaveLength(20);
    expect(records.duePending(NOW + MINUTE)).toEqual([]);
  });

  it("removes newcomers whose check ran out while the worker was down, within the 5 minutes their restriction lasts", async () => {
    const state = emptyCommunityState();
    const before = createRecords(state, { persist: () => undefined, defaults, now: () => NOW - 10 * MINUTE });
    before.setPending(due(301, { deadline: NOW - 90 * SECOND }));
    before.setPending(due(302, { deadline: NOW - 30 * SECOND }));
    // Past the 5 minutes: its restriction has ended, and the privacy page's 15 minutes with it.
    before.setPending(due(303, { deadline: NOW - 6 * MINUTE }));
    // The restart: the records are read again from the same file.
    const records = createRecords(state, { persist: () => undefined, defaults, now: () => NOW });
    const { out, newcomers } = setup({}, records);
    await newcomers.tick(NOW);
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "kick")).toEqual([[GROUP_ID, 301], [GROUP_ID, 302]]);
    expect(records.pending(GROUP_ID, 303)).toBeNull();
    expect(records.duePending(NOW)).toEqual([]);
  });

  it("doesn't remove someone who passed or was trusted after their removal was queued", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<boolean>((resolve) => (release = () => resolve(true)));
    // The newcomers' own restrictions are still on their way, so their removals wait behind them.
    const { out, records, newcomers, join } = setup({ out: { restrict: (_chat, user, permissions) => (permissions.can_send_messages === false ? held : Promise.resolve(true)) } });
    void join([person(401), person(402)], 71, NOW);
    await vi.advanceTimersByTimeAsync(0);
    for (const user of [401, 402]) records.setPending(due(user, { messageId: 5001, joinMessageId: 71 }));
    await newcomers.tick(NOW);
    // An admin trusts 401 (controls drop the check); 402 taps in time.
    records.dropPending(GROUP_ID, 401);
    await newcomers.onPress(press(person(402), "h:0", 5001), NOW + SECOND);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "kick")).toEqual([]);
    expect(callsOf(out.log, "restrict").filter((c) => c[1] === 402).map((c) => (c[2] as { can_send_messages: boolean }).can_send_messages)).toEqual([false, true]);
    expect(records.isNewcomer(GROUP_ID, 402, NOW + MINUTE)).toBe(true);
  });
});
