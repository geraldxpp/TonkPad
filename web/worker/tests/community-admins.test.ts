import { describe, expect, it } from "vitest";
import { createAdmins } from "../src/telegram/community/admins";
import type { TgChatMember } from "../src/telegram/types";
import { BOT_ID, callsOf, GROUP_ID, OWNER_ID, recordOut } from "./community-fixtures";
import { MIN, NOW, SEC } from "./fixtures";

const CREATOR = 1_000;
const TITLE_ONLY = 1_001;
const DELETE_ONLY = 1_002;
const BAN_ONLY = 1_003;
const ANONYMOUS = 1_004;
const MEMBER_ID = 2_000;

const admin = (id: number, extra: Partial<TgChatMember> = {}): TgChatMember => ({
  status: "administrator",
  user: { id, is_bot: false, first_name: "Admin", last_name: String(id), username: `admin${id}` },
  ...extra,
});

const STAFF: TgChatMember[] = [
  { status: "creator", user: { id: CREATOR, first_name: "Creator" } },
  admin(TITLE_ONLY),
  admin(DELETE_ONLY, { can_delete_messages: true }),
  admin(BAN_ONLY, { can_restrict_members: true }),
  admin(ANONYMOUS, { is_anonymous: true, can_delete_messages: true, can_restrict_members: true }),
];

/** Admins over a recorder whose admin list (and members) the test can change between reads. */
function setup(options: { list?: TgChatMember[] | null; owners?: number[]; members?: Record<number, TgChatMember | null>; botId?: number | null } = {}) {
  const state = { list: options.list === undefined ? STAFF : options.list, members: options.members ?? {} };
  const out = recordOut({
    admins: async () => state.list,
    member: async (_chat, user) => (user in state.members ? (state.members[user] ?? null) : { status: "member", user: { id: user } }),
  });
  const admins = createAdmins({ out, owners: options.owners ?? [OWNER_ID], botId: () => (options.botId === undefined ? BOT_ID : options.botId), now: () => NOW });
  return { admins, out, state, reads: () => callsOf(out.log, "admins").length };
}

describe("createAdmins: rights per action", () => {
  it("lets a title-only admin do nothing through the bot but count as an admin", async () => {
    const { admins } = setup();
    await admins.refresh(GROUP_ID, NOW);
    expect(admins.isAdmin(GROUP_ID, TITLE_ONLY)).toBe(true);
    expect(await admins.can(GROUP_ID, TITLE_ONLY, "any", NOW)).toBe(true);
    expect(await admins.can(GROUP_ID, TITLE_ONLY, "restrict", NOW)).toBe(false);
    expect(await admins.can(GROUP_ID, TITLE_ONLY, "delete", NOW)).toBe(false);
  });

  it("lets a Delete-only admin delete but not unmute, and a Ban-users admin restrict but not delete", async () => {
    const { admins } = setup();
    expect(await admins.can(GROUP_ID, DELETE_ONLY, "delete", NOW)).toBe(true);
    expect(await admins.can(GROUP_ID, DELETE_ONLY, "restrict", NOW)).toBe(false);
    expect(await admins.can(GROUP_ID, BAN_ONLY, "restrict", NOW)).toBe(true);
    expect(await admins.can(GROUP_ID, BAN_ONLY, "delete", NOW)).toBe(false);
  });

  it("gives the creator every right, and nobody else's list entry any", async () => {
    const { admins } = setup();
    for (const right of ["any", "delete", "restrict", "owner"] as const) expect(await admins.can(GROUP_ID, CREATOR, right, NOW)).toBe(true);
    expect(await admins.can(GROUP_ID, MEMBER_ID, "any", NOW)).toBe(false);
    expect(admins.list(GROUP_ID).map((a) => a.id)).toEqual([CREATOR, TITLE_ONLY, DELETE_ONLY, BAN_ONLY, ANONYMOUS]);
    expect(admins.list(GROUP_ID)[1]).toEqual({ id: TITLE_ONLY, name: "Admin 1001", username: "admin1001", creator: false, anonymous: false, canDelete: false, canRestrict: false });
  });
});

describe("createAdmins: owners", () => {
  it("counts the creator and the configured owners who are still in the group", async () => {
    const { admins } = setup({ owners: [OWNER_ID, BAN_ONLY] });
    expect(await admins.can(GROUP_ID, CREATOR, "owner", NOW)).toBe(true);
    expect(await admins.can(GROUP_ID, BAN_ONLY, "owner", NOW)).toBe(true);
    // A configured owner who is a plain member is still an owner there.
    expect(await admins.can(GROUP_ID, OWNER_ID, "owner", NOW)).toBe(true);
    // An admin with every right isn't an owner unless configured.
    expect(await admins.can(GROUP_ID, DELETE_ONLY, "owner", NOW)).toBe(false);
  });

  it("drops a configured owner who left, was removed, or is restricted outside the group", async () => {
    const gone = (status: TgChatMember["status"], extra: Partial<TgChatMember> = {}): TgChatMember => ({ status, user: { id: OWNER_ID }, ...extra });
    for (const member of [gone("left"), gone("kicked"), gone("restricted", { is_member: false }), null]) {
      const { admins } = setup({ members: { [OWNER_ID]: member } });
      expect(await admins.can(GROUP_ID, OWNER_ID, "owner", NOW)).toBe(false);
    }
    const { admins } = setup({ members: { [OWNER_ID]: gone("restricted", { is_member: true }) } });
    expect(await admins.can(GROUP_ID, OWNER_ID, "owner", NOW)).toBe(true);
  });
});

describe("createAdmins: anonymous admins", () => {
  it("never pass a right check, even as the creator or a configured owner", async () => {
    const anonymousCreator: TgChatMember = { status: "creator", user: { id: CREATOR }, is_anonymous: true };
    const { admins } = setup({ list: [anonymousCreator, ...STAFF.slice(1)], owners: [ANONYMOUS] });
    for (const right of ["any", "delete", "restrict", "owner"] as const) {
      expect(await admins.can(GROUP_ID, ANONYMOUS, right, NOW)).toBe(false);
      expect(await admins.can(GROUP_ID, CREATOR, right, NOW)).toBe(false);
    }
    // They are still admins: their posts are never moderated.
    expect(admins.isAdmin(GROUP_ID, ANONYMOUS)).toBe(true);
  });

  it("refuses a configured owner whom Telegram shows as an anonymous admin when the list can't be read", async () => {
    const { admins } = setup({ list: null, members: { [OWNER_ID]: admin(OWNER_ID, { is_anonymous: true, can_restrict_members: true }) } });
    expect(await admins.can(GROUP_ID, OWNER_ID, "owner", NOW)).toBe(false);
  });
});

describe("createAdmins: drop and refresh", () => {
  it("forgets a demoted admin at once, before Telegram is asked again", async () => {
    const { admins, state, reads } = setup();
    await admins.refresh(GROUP_ID, NOW);
    state.list = STAFF.filter((m) => m.user.id !== BAN_ONLY);
    admins.drop(GROUP_ID, BAN_ONLY);
    expect(admins.isAdmin(GROUP_ID, BAN_ONLY)).toBe(false);
    expect(admins.list(GROUP_ID).some((a) => a.id === BAN_ONLY)).toBe(false);
    expect(await admins.can(GROUP_ID, BAN_ONLY, "restrict", NOW + SEC)).toBe(false);
    expect(reads()).toBe(1);
  });

  it("learns a promotion at the next read a minute on", async () => {
    const { admins, state, reads } = setup();
    await admins.refresh(GROUP_ID, NOW);
    state.list = [...STAFF, admin(MEMBER_ID, { can_restrict_members: true })];
    admins.drop(GROUP_ID, MEMBER_ID);
    expect(await admins.can(GROUP_ID, MEMBER_ID, "restrict", NOW + 30 * SEC)).toBe(false);
    expect(await admins.can(GROUP_ID, MEMBER_ID, "restrict", NOW + MIN)).toBe(true);
    expect(reads()).toBe(2);
  });

  it("reads Telegram at most once a minute per group, and shares a read in flight", async () => {
    const { admins, reads } = setup();
    await Promise.all([admins.refresh(GROUP_ID, NOW), admins.refresh(GROUP_ID, NOW)]);
    await admins.refresh(GROUP_ID, NOW + 59 * SEC);
    expect(reads()).toBe(1);
    await admins.refresh(GROUP_ID, NOW + MIN);
    expect(reads()).toBe(2);
  });

  it("reads again for a rights check once the list is 10 minutes old", async () => {
    const { admins, reads } = setup();
    await admins.can(GROUP_ID, BAN_ONLY, "restrict", NOW);
    await admins.can(GROUP_ID, BAN_ONLY, "restrict", NOW + 9 * MIN);
    expect(reads()).toBe(1);
    await admins.can(GROUP_ID, BAN_ONLY, "restrict", NOW + 10 * MIN);
    expect(reads()).toBe(2);
  });

  it("keeps the last list when a read fails, but grants no right on one 30 minutes unconfirmed", async () => {
    const { admins, state } = setup();
    await admins.refresh(GROUP_ID, NOW);
    state.list = null;
    expect(await admins.can(GROUP_ID, BAN_ONLY, "restrict", NOW + 11 * MIN)).toBe(true);
    expect(await admins.can(GROUP_ID, BAN_ONLY, "restrict", NOW + 30 * MIN)).toBe(false);
    expect(admins.isAdmin(GROUP_ID, BAN_ONLY)).toBe(true);
  });

  it("grants nothing in a group whose list was never read", async () => {
    const { admins } = setup({ list: null });
    expect(await admins.can(GROUP_ID, BAN_ONLY, "any", NOW)).toBe(false);
    expect(admins.list(GROUP_ID)).toEqual([]);
  });
});

describe("createAdmins: the bot's own rights", () => {
  it("reads them from getChatMember for the bot", async () => {
    const { admins, out } = setup({ members: { [BOT_ID]: admin(BOT_ID, { can_delete_messages: true }) } });
    expect(await admins.botRights(GROUP_ID)).toEqual({ delete: true, restrict: false });
    expect(callsOf(out.log, "member")).toEqual([[GROUP_ID, BOT_ID]]);
  });

  it("says none for a bot that isn't an admin, and null when Telegram can't say", async () => {
    expect(await setup({ members: { [BOT_ID]: { status: "member", user: { id: BOT_ID } } } }).admins.botRights(GROUP_ID)).toEqual({ delete: false, restrict: false });
    expect(await setup({ members: { [BOT_ID]: null } }).admins.botRights(GROUP_ID)).toBeNull();
    expect(await setup({ botId: null }).admins.botRights(GROUP_ID)).toBeNull();
  });
});
