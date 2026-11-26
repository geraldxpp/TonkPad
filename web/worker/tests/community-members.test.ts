import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOIN_WAIT_MS } from "../src/telegram/community/members-joins";
import { MUTED } from "../src/telegram/community/permissions";
import { leftSince } from "../src/telegram/mod/actions-left";
import type { Admins } from "../src/telegram/community/types";
import type { TgChatMemberUpdated, TgUser } from "../src/telegram/types";
import { BOT_ID, callsOf, fakeAdmins, GROUP_ID, OWNER_ID, recordOut } from "./community-fixtures";
import { ADMIN_ID, change, joined, leftMessage, membersBench, OTHER, person, unix } from "./community-members-fixtures";
import { MIN, NOW } from "./fixtures";
import { setup as newcomersBench } from "./mod-newcomers-setup";

const SAM = person(201);
const ADDER = person(301);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createMembers: joins", () => {
  it("lets a chat_member join wait a moment for the joined message, and passes it on once with that message's ID", async () => {
    const { members, joins } = membersBench();
    await members.onMember(change(SAM, {}, {}));
    expect(joins).toEqual([]);
    await members.onServiceJoin(joined([SAM], 71));
    expect(joins).toEqual([{ chat: GROUP_ID, users: [201], adder: 201, joinMessageId: 71, date: unix(NOW) }]);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(joins).toHaveLength(1);
  });

  it("passes a join on alone after a second without its message, and skips the message coming later", async () => {
    const { members, joins } = membersBench();
    await members.onMember(change(SAM, { status: "kicked" }, { status: "restricted", is_member: true }, { from: ADDER }));
    await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS);
    expect(joins).toEqual([{ chat: GROUP_ID, users: [201], adder: 301, joinMessageId: null, date: unix(NOW) }]);
    await members.onServiceJoin(joined([SAM], 71, { from: ADDER }));
    expect(joins).toHaveLength(1);
  });

  it("passes the joined message's people on together at once, and skips their chat_member updates", async () => {
    const { members, joins } = membersBench();
    await members.onServiceJoin(joined([SAM, person(202), SAM], 72, { from: ADDER }));
    await members.onMember(change(SAM, {}, {}, { from: ADDER }));
    await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS);
    expect(joins).toEqual([{ chat: GROUP_ID, users: [201, 202], adder: 301, joinMessageId: 72, date: unix(NOW) }]);
  });

  it("checks someone who leaves and comes back again", async () => {
    const { members, joins } = membersBench();
    await members.onServiceJoin(joined([SAM], 71));
    await members.onMember(change(SAM, { status: "restricted", is_member: true }, { status: "left" }));
    await members.onServiceJoin(joined([SAM], 75));
    expect(joins.map((j) => j.joinMessageId)).toEqual([71, 75]);
  });

  it("skips the bot itself, and updates it can't read", async () => {
    const { members, joins } = membersBench();
    await members.onServiceJoin(joined([{ id: BOT_ID, is_bot: true, first_name: "TonkFun" }], 70, { from: person(OWNER_ID) }));
    await members.onMember({ chat: { id: GROUP_ID, type: "supergroup" } } as unknown as TgChatMemberUpdated);
    await members.onMember(change({ id: -5 } as TgUser, {}, {}));
    await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS);
    expect(joins).toEqual([]);
  });
});

describe("createMembers: with the real new-member check", () => {
  it("restricts a newcomer and posts the check, replying to the join message", async () => {
    const bench = newcomersBench();
    const { members } = membersBench({ newcomers: bench.newcomers, records: bench.records });
    await members.onMember(change(SAM, {}, {}));
    await members.onServiceJoin(joined([SAM], 71));
    expect(callsOf(bench.out.log, "restrict")).toEqual([[GROUP_ID, 201, MUTED, unix(NOW + 10 * MIN)]]);
    const sends = callsOf(bench.out.log, "send");
    expect(sends).toHaveLength(1);
    expect(sends[0][2]).toMatchObject({ kind: "check", replyTo: 71 });
  });

  it("only marks a join older than 5 minutes as new", async () => {
    const bench = newcomersBench();
    const { members } = membersBench({ newcomers: bench.newcomers, records: bench.records });
    await members.onServiceJoin(joined([SAM], 71, { date: unix(NOW - 10 * MIN) }));
    expect(callsOf(bench.out.log, "restrict")).toEqual([]);
    expect(callsOf(bench.out.log, "send")).toEqual([]);
    expect(bench.records.isNewcomer(GROUP_ID, 201, NOW)).toBe(true);
  });

  it("bans a bot a member added, once, though Telegram reports it twice", async () => {
    const bench = newcomersBench();
    const { members } = membersBench({ newcomers: bench.newcomers, records: bench.records });
    const spam: TgUser = { id: 8_001, is_bot: true, first_name: "Spam", username: "spammybot" };
    await members.onServiceJoin(joined([spam], 80, { from: SAM }));
    await members.onMember(change(spam, {}, {}, { from: SAM }));
    await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS);
    expect(callsOf(bench.out.log, "ban")).toEqual([[GROUP_ID, 8_001]]);
    expect(bench.alerts).toEqual([expect.objectContaining({ kind: "action", category: "bot_added" })]);
  });
});

describe("createMembers: leaves and admins", () => {
  it("deletes a member's records there when they leave, are removed or are banned, and takes them off the check", async () => {
    const { members, records, leaves } = membersBench();
    records.addOffence(GROUP_ID, 201, NOW, "unknown_link", true);
    records.trust(GROUP_ID, 202, "0123456789abcdef", NOW);
    records.markNewcomer(GROUP_ID, 203, NOW, NOW + 3 * 24 * 60 * MIN);
    await members.onMember(change(SAM, { status: "member" }, { status: "left" }));
    members.onServiceLeft(leftMessage(person(202), 90));
    await members.onMember(change(person(203), { status: "restricted", is_member: true }, { status: "kicked" }, { from: person(OWNER_ID) }));
    expect(records.offences(GROUP_ID, 201, NOW).n).toBe(0);
    expect(records.isTrusted(GROUP_ID, 202)).toBe(false);
    expect(records.isNewcomer(GROUP_ID, 203, NOW)).toBe(false);
    expect(leaves).toEqual([[GROUP_ID, 201], [GROUP_ID, 202], [GROUP_ID, 203]]);
    // A late verdict on what they posted before leaving records no offence.
    for (const user of [201, 202, 203]) expect(leftSince(records, GROUP_ID, user, NOW, NOW + MIN)).toBe(true);
  });

  it("forgets an admin at once on a demotion, and reads the list again on a promotion or demotion", async () => {
    const real = fakeAdmins({ [GROUP_ID]: [] });
    const refresh = vi.fn(async () => undefined);
    const drop = vi.fn();
    const { members, admins } = membersBench();
    await members.onMember(change(person(ADMIN_ID), { status: "administrator", can_delete_messages: true }, { status: "member" }, { from: person(OWNER_ID) }));
    expect(admins.isAdmin(GROUP_ID, ADMIN_ID)).toBe(false);

    const spied: Admins = { ...real, drop, refresh };
    const second = membersBench({ admins: spied });
    await second.members.onMember(change(person(402), { status: "member" }, { status: "administrator", can_restrict_members: true }, { from: person(OWNER_ID) }));
    await second.members.onMember(change(person(403), { status: "administrator" }, { status: "left" }));
    await second.members.onMember(change(person(404), { status: "member" }, { status: "restricted", is_member: true }));
    expect(drop.mock.calls).toEqual([[GROUP_ID, 402], [GROUP_ID, 403]]);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(second.leaves).toEqual([[GROUP_ID, 403]]);
  });

  it("forgets what Telegram said about someone at every update about them, whatever changed, so no read uses a stale answer", async () => {
    const out = recordOut();
    const { members } = membersBench({ out });
    // An admin mutes SAM in the app: nothing else changes for the bot, but the kept answer ("member") is stale now.
    await members.onMember(change(SAM, { status: "member" }, { status: "restricted", is_member: true, until_date: unix(NOW) + 86_400 }, { from: person(OWNER_ID) }));
    await members.onMember(change(SAM, { status: "restricted", is_member: true }, { status: "restricted", is_member: false }));
    await members.onServiceJoin(joined([person(202)], 71));
    members.onServiceLeft(leftMessage(person(203), 72));
    await members.onMyMember(change({ id: BOT_ID, is_bot: true, first_name: "TonkFun" }, { status: "administrator" }, { status: "member" }, { from: person(OWNER_ID) }));
    // Not a group it runs: nothing is read there, so nothing to forget.
    await members.onMember(change(SAM, { status: "member" }, { status: "left" }, { chat: OTHER }));
    expect(callsOf(out.log, "forget")).toEqual([[GROUP_ID, 201], [GROUP_ID, 201], [GROUP_ID, 202], [GROUP_ID, 203], [GROUP_ID, BOT_ID]]);
  });

  it("does nothing in a chat it doesn't own", async () => {
    const drop = vi.fn();
    const { members, joins, leaves, records } = membersBench({ admins: { ...fakeAdmins(), drop } });
    records.addOffence(OTHER.id, 201, NOW, "flood", false);
    await members.onMember(change(SAM, {}, {}, { chat: OTHER }));
    await members.onServiceJoin(joined([person(202)], 71, { chat: OTHER }));
    await members.onMember(change(SAM, { status: "member" }, { status: "left" }, { chat: OTHER }));
    members.onServiceLeft(leftMessage(person(202), 72, OTHER));
    await members.onMember(change(person(ADMIN_ID), { status: "administrator" }, { status: "member" }, { chat: OTHER }));
    await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS);
    expect(joins).toEqual([]);
    expect(leaves).toEqual([]);
    expect(drop).not.toHaveBeenCalled();
    expect(records.offences(OTHER.id, 201, NOW).n).toBe(1);
  });
});
