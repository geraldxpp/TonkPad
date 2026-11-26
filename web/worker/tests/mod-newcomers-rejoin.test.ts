import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOIN_WAIT_MS } from "../src/telegram/community/members-joins";
import { MUTED } from "../src/telegram/community/permissions";
import { permissionsOf } from "../src/telegram/mod/newcomers-held";
import type { TgChatMember } from "../src/telegram/types";
import { callsOf, GROUP_ID } from "./community-fixtures";
import { change, joined, membersBench } from "./community-members-fixtures";
import { NOW } from "./fixtures";
import { DAY, MINUTE, person, SECOND, setup as newcomersBench, unix } from "./mod-newcomers-setup";

const SAM = person(201);

/** A restriction with no sending, ending at `untilMs` (0: never), as Telegram reports it in or out of the group. */
const muted = (untilMs: number, member: boolean): Partial<TgChatMember> => ({ status: "restricted", is_member: member, can_send_messages: false, until_date: untilMs === 0 ? 0 : unix(untilMs) });

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("someone who leaves and comes back while restricted", () => {
  it("keeps a 24-hour mute Telegram kept across the leave: no check, no new restriction, marked new, and their records still went with the leave", async () => {
    const bench = newcomersBench();
    const { members } = membersBench({ newcomers: bench.newcomers, records: bench.records });
    bench.records.addOffence(GROUP_ID, SAM.id, NOW - MINUTE, "lookalike", true);
    await members.onMember(change(SAM, muted(NOW + DAY, true), muted(NOW + DAY, false)));
    expect(bench.records.offences(GROUP_ID, SAM.id, NOW).n).toBe(0);

    await members.onMember(change(SAM, muted(NOW + DAY, false), muted(NOW + DAY, true)));
    await members.onServiceJoin(joined([SAM], 71));
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(bench.out.log, "restrict")).toEqual([]);
    expect(callsOf(bench.out.log, "send")).toEqual([]);
    expect(callsOf(bench.out.log, "member")).toEqual([]);
    expect(bench.records.pending(GROUP_ID, SAM.id)).toBeNull();
    expect(bench.records.isNewcomer(GROUP_ID, SAM.id, NOW + DAY)).toBe(true);
  });

  it("keeps a mute without an end (an admin's, set in the app) the same way", async () => {
    const bench = newcomersBench();
    const { members } = membersBench({ newcomers: bench.newcomers, records: bench.records });
    await members.onMember(change(SAM, muted(0, false), muted(0, true)));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(callsOf(bench.out.log, "restrict")).toEqual([]);
    expect(callsOf(bench.out.log, "send")).toEqual([]);
    expect(bench.records.isNewcomer(GROUP_ID, SAM.id, NOW)).toBe(true);
  });

  it("restricts at once when only the joined message reports the join, then reads fresh and puts back a restriction that outlasts the check's", async () => {
    const held = { status: "restricted" as const, is_member: true, can_send_messages: false, can_add_web_page_previews: true, until_date: unix(NOW + DAY) };
    const bench = newcomersBench({ out: { member: async (_chat, user) => ({ ...held, user: person(user) }) } });
    const { members } = membersBench({ newcomers: bench.newcomers, records: bench.records });
    void members.onServiceJoin(joined([SAM], 71));
    await vi.advanceTimersByTimeAsync(0);
    // Restricted before any read.
    expect(callsOf(bench.out.log, "restrict")).toEqual([[GROUP_ID, SAM.id, MUTED, unix(NOW + 10 * MINUTE)]]);
    expect(callsOf(bench.out.log, "member")).toEqual([]);
    await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS);
    expect(callsOf(bench.out.log, "member")).toEqual([[GROUP_ID, SAM.id, { fresh: true }]]);
    // Their own 24 hours are put back, with their own permissions, and they come off the check (deleted with its last newcomer).
    expect(callsOf(bench.out.log, "restore")).toEqual([[GROUP_ID, SAM.id, permissionsOf({ ...held, user: SAM }), unix(NOW + DAY)]]);
    expect(bench.records.pending(GROUP_ID, SAM.id)).toBeNull();
    expect(callsOf(bench.out.log, "remove")).toContainEqual([GROUP_ID, [5001]]);
    expect(bench.records.isNewcomer(GROUP_ID, SAM.id, NOW)).toBe(true);
    expect(callsOf(bench.out.log, "restrict")).toHaveLength(1);
  });

  it("checks them as usual when what they hold ends before the check's restriction would", async () => {
    const bench = newcomersBench();
    const { members } = membersBench({ newcomers: bench.newcomers, records: bench.records });
    await members.onMember(change(SAM, muted(NOW + 2 * MINUTE, false), muted(NOW + 2 * MINUTE, true)));
    await members.onServiceJoin(joined([SAM], 71));
    expect(callsOf(bench.out.log, "restrict")).toEqual([[GROUP_ID, SAM.id, MUTED, unix(NOW + 10 * MINUTE)]]);
    expect(callsOf(bench.out.log, "send")).toHaveLength(1);
    expect(bench.records.pending(GROUP_ID, SAM.id)).not.toBeNull();
  });

  it("puts back what the update says when it comes within the second the joined message waits, and posts no check for them", async () => {
    const bench = newcomersBench();
    const { members } = membersBench({ newcomers: bench.newcomers, records: bench.records });
    void members.onServiceJoin(joined([SAM], 71));
    await vi.advanceTimersByTimeAsync(300);
    await members.onMember(change(SAM, muted(NOW + DAY, false), muted(NOW + DAY, true)));
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(bench.out.log, "restrict")).toEqual([[GROUP_ID, SAM.id, MUTED, unix(NOW + 10 * MINUTE)]]);
    expect(callsOf(bench.out.log, "restore")).toEqual([[GROUP_ID, SAM.id, MUTED, unix(NOW + DAY)]]);
    await vi.advanceTimersByTimeAsync(5 * SECOND);
    expect(callsOf(bench.out.log, "send")).toEqual([]);
    expect(callsOf(bench.out.log, "member")).toEqual([]);
    expect(bench.records.pending(GROUP_ID, SAM.id)).toBeNull();
    expect(bench.records.isNewcomer(GROUP_ID, SAM.id, NOW)).toBe(true);
  });

  it("doesn't use what an earlier join said once they have left again", async () => {
    const bench = newcomersBench();
    const { members } = membersBench({ newcomers: bench.newcomers, records: bench.records });
    // The joined message came first and the update said they held a day's mute (put back); then they leave, and come back with nothing held.
    void members.onServiceJoin(joined([SAM], 71));
    await members.onMember(change(SAM, muted(NOW + DAY, false), muted(NOW + DAY, true)));
    await vi.advanceTimersByTimeAsync(0);
    await members.onMember(change(SAM, { status: "restricted", is_member: true }, { status: "left" }));
    void members.onServiceJoin(joined([SAM], 75));
    await members.onMember(change(SAM, {}, {}));
    await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS);
    expect(callsOf(bench.out.log, "restrict").map((c) => c[1])).toEqual([SAM.id, SAM.id]);
    expect(callsOf(bench.out.log, "restore")).toHaveLength(1);
    expect(callsOf(bench.out.log, "send")).toHaveLength(1);
    expect(bench.records.pending(GROUP_ID, SAM.id)).toMatchObject({ messageId: 5001, joinMessageId: 75 });
  });
});
