import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MUTED } from "../src/telegram/community/permissions";
import type { TgChatMember } from "../src/telegram/types";
import { callsOf, GROUP_ID, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";
import { MINUTE, person, press, SECOND, setup, unix } from "./mod-newcomers-setup";

/** Resolves `value` after `ms` on the fake clock: a Telegram call that takes that long. */
const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("posting the new-member check", () => {
  it("names everyone who joined with one message in its one send", async () => {
    const { out, records, join } = setup();
    await join([person(201), person(202), person(203)], 71, NOW);
    const sends = callsOf(out.log, "send");
    expect(sends).toHaveLength(1);
    for (const id of [201, 202, 203]) expect(sends[0][1]).toContain(`id=${id}"`);
    expect(callsOf(out.log, "edit")).toEqual([]);
    expect(records.pendingOn(GROUP_ID, 5001).map((p) => p.user)).toEqual([201, 202, 203]);
  });

  it("counts a newcomer's time from when the check they waited for went out, and names who joined while it was on its way", async () => {
    const { out, records, at, join } = setup({ out: { send: () => after(2 * SECOND, 5001) } });
    void join([person(201)], 71, NOW);
    void join([person(202)], 72, NOW + SECOND);
    // Both are restricted at once, though the check isn't out yet.
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "restrict").map((c) => c[1])).toEqual([201, 202]);
    expect(callsOf(out.log, "send")).toHaveLength(1);
    at(NOW + 2 * SECOND);
    await vi.advanceTimersByTimeAsync(2 * SECOND);
    expect(records.pending(GROUP_ID, 201)?.deadline).toBe(NOW + 2 * SECOND + 5 * MINUTE);
    expect(records.pending(GROUP_ID, 202)?.deadline).toBe(NOW + 2 * SECOND + 5 * MINUTE);
    const edit = callsOf(out.log, "edit").at(-1);
    expect(edit?.[1]).toBe(5001);
    expect(edit?.[2]).toContain('id=201"');
    expect(edit?.[2]).toContain('id=202"');
  });

  it("restricts a joiner at once when the joined message comes first, before any read, and checks them once their update has had a second", async () => {
    // Telegram never answers the read: nothing may wait for it.
    const { out, records, joinFirst } = setup({ out: { member: () => new Promise<TgChatMember | null>(() => undefined) } });
    void joinFirst([person(201)], 71, NOW);
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "restrict")).toEqual([[GROUP_ID, 201, MUTED, unix(NOW + 10 * MINUTE)]]);
    expect(callsOf(out.log, "member")).toEqual([]);
    // Written as they are restricted, before the check is out.
    expect(records.pending(GROUP_ID, 201)).toMatchObject({ messageId: 0, joinMessageId: 71, deadline: NOW + 5 * MINUTE });
    expect(callsOf(out.log, "send")).toEqual([]);
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(callsOf(out.log, "send")).toHaveLength(1);
    expect(records.pending(GROUP_ID, 201)?.messageId).toBe(5001);
    // Only then a read, fresh, in the lane that never delays restrictions and removals.
    expect(callsOf(out.log, "member")).toEqual([[GROUP_ID, 201, { fresh: true }]]);
    expect(callsOf(out.log, "restrict")).toHaveLength(1);
  });

  it("does nothing more for someone who left while their update was waited for, though they were restricted at once", async () => {
    const { out, records, newcomers, joinFirst } = setup();
    void joinFirst([person(201)], 71, NOW);
    await vi.advanceTimersByTimeAsync(0);
    newcomers.onLeave(GROUP_ID, 201);
    await vi.advanceTimersByTimeAsync(2 * SECOND);
    expect(callsOf(out.log, "restrict").map((c) => c[1])).toEqual([201]);
    expect(callsOf(out.log, "send")).toEqual([]);
    expect(callsOf(out.log, "member")).toEqual([]);
    expect(records.pending(GROUP_ID, 201)).toBeNull();
  });

  it("answers a second tap after passing without a word, and still tells anyone else the check isn't theirs", async () => {
    const { out, newcomers, join } = setup();
    await join([person(201), person(202)], 71, NOW);
    await newcomers.onPress(press(person(201), "h:0", 5001), NOW + SECOND);
    await newcomers.onPress(press(person(201), "h:0", 5001), NOW + SECOND);
    await newcomers.onPress(press(person(999), "h:0", 5001), NOW + SECOND);
    expect(callsOf(out.log, "answerPress").map((c) => c[1])).toEqual([testWords.check.passed, undefined, testWords.check.notYou]);
  });

  it("doesn't remove someone who left after their removal was queued", async () => {
    const { out, records, newcomers, join } = setup({ out: { restrict: (_chat, _user, permissions) => (permissions.can_send_messages === false ? after(10 * SECOND, true) : Promise.resolve(true)) } });
    void join([person(201)], 71, NOW);
    await vi.advanceTimersByTimeAsync(0);
    await newcomers.tick(NOW + 5 * MINUTE);
    // They leave: members.ts tells the check first, then forgets their records.
    newcomers.onLeave(GROUP_ID, 201);
    records.forgetMember(GROUP_ID, 201);
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(callsOf(out.log, "kick")).toEqual([]);
    expect(callsOf(out.log, "remove")).toContainEqual([GROUP_ID, [5001]]);
  });
});
