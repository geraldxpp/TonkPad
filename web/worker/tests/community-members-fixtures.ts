import { createMembers, type MembersDeps } from "../src/telegram/community/members";
import type { AdminAlert, Newcomers } from "../src/telegram/community/types";
import type { TgChat, TgChatMember, TgChatMemberUpdated, TgMessage, TgUser } from "../src/telegram/types";
import { adminInfo, BOT_ID, fakeAdmins, GROUP, GROUP_ID, memoryRecords, OWNER_ID, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";
import { person, unix } from "./mod-newcomers-setup";

/** A group the bot is in but doesn't own. */
export const OTHER: TgChat = { id: -1_005_555_555_555, type: "supergroup", title: "Someone else's group" };
export const ME: TgUser = { id: BOT_ID, is_bot: true, first_name: "TonkFun", username: "TonkfunBot" };
export const ADMIN_ID = 401;

interface Where {
  from?: TgUser;
  chat?: TgChat;
  date?: number;
}

/** A chat_member (or my_chat_member) update: `user` went from `before` (left by default) to `after` (member by default). */
export function change(user: TgUser, before: Partial<TgChatMember>, after: Partial<TgChatMember>, where: Where = {}): TgChatMemberUpdated {
  return {
    chat: where.chat ?? GROUP,
    from: where.from ?? user,
    date: where.date ?? unix(NOW),
    old_chat_member: { status: "left", user, ...before },
    new_chat_member: { status: "member", user, ...after },
  };
}

/** The "joined" service message. */
export const joined = (users: TgUser[], messageId: number, where: Where = {}): TgMessage => ({
  message_id: messageId, date: where.date ?? unix(NOW), chat: where.chat ?? GROUP, from: where.from ?? users[0], new_chat_members: users,
});

/** The "left" service message. */
export const leftMessage = (user: TgUser, messageId: number, chat: TgChat = GROUP): TgMessage => ({
  message_id: messageId, date: unix(NOW), chat, from: user, left_chat_member: user,
});

/** New-member checks that only note what they were handed. */
function noteNewcomers() {
  const joins: Array<{ chat: number; users: number[]; adder: number | null; joinMessageId: number | null; date: number }> = [];
  const leaves: Array<[number, number]> = [];
  const newcomers: Newcomers = {
    onJoin: async (chat, users, adder, joinMessageId, date) => void joins.push({ chat, users: users.map((u) => u.id), adder: adder?.id ?? null, joinMessageId, date }),
    onPress: async () => false,
    onLeave: (chat, user) => void leaves.push([chat, user]),
    tick: async () => undefined,
  };
  return { newcomers, joins, leaves };
}

/** createMembers for the community group (owned), on the test's clock, with an owner who created it and one more admin. */
export function membersBench(overrides: Partial<MembersDeps> = {}) {
  const lines: string[] = [];
  const alerts: AdminAlert[] = [];
  const records = memoryRecords({ strictness: "normal" });
  const noted = noteNewcomers();
  const admins = fakeAdmins({ [GROUP_ID]: [adminInfo(OWNER_ID, { creator: true }), adminInfo(ADMIN_ID)] }, [OWNER_ID]);
  const deps: MembersDeps = {
    owns: (chat) => chat === GROUP_ID,
    records,
    newcomers: noted.newcomers,
    admins,
    alerts: { alert: (a) => void alerts.push(a) },
    botId: () => BOT_ID,
    owners: [OWNER_ID],
    words: testWords,
    log: (line) => void lines.push(line),
    now: () => Date.now(),
    ...overrides,
  };
  return { members: createMembers(deps), lines, alerts, records, admins, ...noted };
}

export { person, unix };
