import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MUTED } from "../src/telegram/community/permissions";
import { createRecords } from "../src/telegram/community/records";
import { emptyCommunityState } from "../src/telegram/community/state";
import type { ChatSettings } from "../src/telegram/community/types";
import { callsOf, GROUP_ID } from "./community-fixtures";
import { change, joined, leftMessage, membersBench } from "./community-members-fixtures";
import { NOW } from "./fixtures";
import { MINUTE, person, press, SECOND, setup, unix } from "./mod-newcomers-setup";

const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const defaults = (): ChatSettings => ({ paused: false, proactive: true, strictness: "normal", raidUntil: 0 });
/** Records over one state file: a restart reads the same file again. */
const fileRecords = (state = emptyCommunityState()) => ({ state, records: createRecords(state, { persist: () => undefined, defaults, now: () => Date.now() }) });

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a check that can't be posted", () => {
  it("carries each newcomer's restriction and record forward in 10-minute steps while it is tried, never more than 15 minutes ahead", async () => {
    const { out, records, newcomers, at, join } = setup({ out: { send: async () => null } });
    await join([person(201)], 71, NOW);
    const ahead: number[] = [];
    for (let t = 5 * SECOND; t < 30 * MINUTE; t += 5 * SECOND) {
      await newcomers.tick(at(NOW + t));
      await vi.advanceTimersByTimeAsync(0);
      const deadline = records.pending(GROUP_ID, 201)?.deadline ?? 0;
      ahead.push(deadline + 5 * MINUTE - (NOW + t));
    }
    // The first restriction (10 minutes), then one a minute before each record's deadline.
    expect(callsOf(out.log, "restrict")).toEqual([
      [GROUP_ID, 201, MUTED, unix(NOW + 10 * MINUTE)],
      [GROUP_ID, 201, MUTED, unix(NOW + 4 * MINUTE + 15 * MINUTE)],
      [GROUP_ID, 201, MUTED, unix(NOW + 13 * MINUTE + 15 * MINUTE)],
      [GROUP_ID, 201, MUTED, unix(NOW + 22 * MINUTE + 15 * MINUTE)],
    ]);
    // Their restriction never ran out while they waited, and the record never reached more than 15 minutes ahead (the privacy page's).
    expect(Math.min(...ahead)).toBeGreaterThan(5 * MINUTE);
    expect(Math.max(...ahead)).toBeLessThanOrEqual(15 * MINUTE);
  });

  it("gives everyone their full time when it goes out late, restricting again whoever's restriction would end too soon", async () => {
    let fails = true;
    const { out, records, newcomers, at, join } = setup({ out: { send: async () => (fails ? null : 7001) } });
    await join([person(201)], 71, NOW);
    for (let t = 15 * SECOND; t <= 3 * MINUTE; t += 15 * SECOND) await newcomers.tick(at(NOW + t));
    fails = false;
    await newcomers.tick(at(NOW + 3 * MINUTE + 30 * SECOND));
    await vi.advanceTimersByTimeAsync(0);
    expect(records.pending(GROUP_ID, 201)).toMatchObject({ messageId: 7001, deadline: NOW + 8 * MINUTE + 30 * SECOND });
    // The first restriction ended at 10 minutes: too close to the new deadline, so a new one runs to its end plus 5 minutes.
    expect(callsOf(out.log, "restrict").at(-1)).toEqual([GROUP_ID, 201, MUTED, unix(NOW + 13 * MINUTE + 30 * SECOND)]);
    // They can pass now, and are removed only at their new deadline.
    await newcomers.tick(at(NOW + 8 * MINUTE));
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "kick")).toEqual([]);
    await newcomers.tick(at(NOW + 8 * MINUTE + 30 * SECOND));
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "kick")).toEqual([[GROUP_ID, 201]]);
  });

  it("is never the tick's to fail while it is tried, and leaves out whoever an admin trusted meanwhile", async () => {
    let fails = true;
    const { out, records, newcomers, at, join } = setup({ out: { send: async () => (fails ? null : 7001) } });
    await join([person(201), person(202)], 71, NOW);
    // An admin trusts 202 (controls drop their check).
    records.dropPending(GROUP_ID, 202);
    for (let t = 15 * SECOND; t <= 6 * MINUTE; t += 15 * SECOND) await newcomers.tick(at(NOW + t));
    expect(callsOf(out.log, "kick")).toEqual([]);
    fails = false;
    await newcomers.tick(at(NOW + 6 * MINUTE + 15 * SECOND));
    await vi.advanceTimersByTimeAsync(0);
    const sends = callsOf(out.log, "send");
    expect(sends.at(-1)?.[1]).toContain("id=201");
    expect(sends.at(-1)?.[1]).not.toContain("id=202");
    expect(records.pending(GROUP_ID, 202)).toBeNull();
    expect(records.pending(GROUP_ID, 201)?.messageId).toBe(7001);
  });

  it("lets a waiting send go out though its group's edits are under way: an edit never holds it up", async () => {
    // Every edit takes 10 seconds to come back; the second check's send must not wait for them.
    const { out, records, join } = setup({ out: { edit: () => after(10 * SECOND, true) } });
    await join([person(201)], 71, NOW);
    await join([person(202)], 72, NOW + 5 * SECOND);
    const second = join([person(203)], 73, NOW + 25 * SECOND);
    await vi.advanceTimersByTimeAsync(0);
    await second;
    expect(callsOf(out.log, "send")).toHaveLength(2);
    expect(records.pending(GROUP_ID, 203)?.messageId).toBe(5002);
  });
});

describe("a restart", () => {
  it("never loses a joiner whose check was still on its way: their record is there from the moment they were restricted, and the tick removes them at the deadline", async () => {
    const { state, records } = fileRecords();
    const first = setup({ out: { send: () => after(3 * SECOND, 5001) } }, records);
    void first.join([person(201), person(202)], 71, NOW);
    await vi.advanceTimersByTimeAsync(2_500);
    // The worker stops 2.5 seconds into the send: the file has both, not yet posted.
    expect(Object.values(state.pending).map((p) => [p.user, p.messageId])).toEqual([[201, 0], [202, 0]]);
    const reloaded = fileRecords(JSON.parse(JSON.stringify(state)) as typeof state);
    const second = setup({}, reloaded.records);
    await second.newcomers.tick(second.at(NOW + 4 * MINUTE));
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(second.out.log, "kick")).toEqual([]);
    await second.newcomers.tick(second.at(NOW + 5 * MINUTE));
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(second.out.log, "kick")).toEqual([[GROUP_ID, 201], [GROUP_ID, 202]]);
    expect(callsOf(second.out.log, "remove")).toContainEqual([GROUP_ID, [71]]);
    expect(reloaded.records.pendingIn(GROUP_ID)).toEqual([]);
  });

  it("deletes a check posted before it when its last newcomer leaves", async () => {
    const { records } = fileRecords();
    const first = setup({}, records);
    await first.join([person(201), person(202)], 71, NOW);
    // The restart: a new check over the same records.
    const second = setup({}, records);
    const { members } = membersBench({ newcomers: second.newcomers, records });
    await second.newcomers.onPress(press(person(201), "h:0", 5001), second.at(NOW + 65 * SECOND));
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(second.out.log, "edit").at(-1)?.[2]).toContain("id=202");
    await members.onMember(change(person(202), { status: "restricted", is_member: true }, { status: "left" }));
    members.onServiceLeft(leftMessage(person(202), 90));
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(second.out.log, "remove")).toContainEqual([GROUP_ID, [5001]]);
    expect(records.pendingIn(GROUP_ID)).toEqual([]);
  });

  it("deletes the check message when the last newcomer on it leaves, in the order members.ts tells it", async () => {
    const bench = setup();
    const { members } = membersBench({ newcomers: bench.newcomers, records: bench.records });
    await members.onMember(change(person(201), {}, {}));
    await members.onServiceJoin(joined([person(201)], 71));
    await members.onMember(change(person(201), { status: "restricted", is_member: true }, { status: "left" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(bench.out.log, "remove")).toContainEqual([GROUP_ID, [5001]]);
  });
});
