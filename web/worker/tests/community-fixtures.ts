import { type ClaudeFailure, LANES, type Budget, type BudgetStatus, type Lane, type Ticket, type Usage } from "../src/telegram/claude/types";
import type { AdminInfo, Admins, ChatId } from "../src/telegram/community/types";
import type { TgCallbackQuery, TgChat, TgMessage, TgUser } from "../src/telegram/types";
import { NOW } from "./fixtures";

/**
 * Fakes for the community agent's tests: nothing here touches the network.
 * Claude's client and messages, the CommunityOut recorder, the in-memory
 * records and the placeholder words live in community-fixtures-*.ts and are
 * re-exported here.
 */
export { claudeMessage, failure, fakeClaude, ok, type ScriptStep, textBlock, toolUseBlock } from "./community-fixtures-claude";
export { actionsOf, callsOf, type OutCall, recordOut } from "./community-fixtures-out";
export { memoryRecords } from "./community-fixtures-records";
export { testWords } from "./community-fixtures-words";

/** The allow-listed community group, the team's admin chat, an owner and the bot. */
export const GROUP_ID = -1001234567890;
export const ADMIN_CHAT_ID = -1009876543210;
export const OWNER_ID = 7_001;
export const BOT_ID = 9_000;
export const GROUP: TgChat = { id: GROUP_ID, type: "supergroup", title: "tonkfun.fun community" };
export const MEMBER: TgUser = { id: 101, is_bot: false, first_name: "Sam", language_code: "en" };
export const BOT: TgUser = { id: BOT_ID, is_bot: true, first_name: "TonkFun", username: "TonkfunBot" };

let nextMessage = 1;

/** A member's message in the community group, sent at NOW; `extra` overrides any field. */
export function groupMessage(text: string, extra: Partial<TgMessage> = {}): TgMessage {
  nextMessage += 1;
  return { message_id: nextMessage, date: Math.floor(NOW / 1000), chat: GROUP, from: MEMBER, text, ...extra };
}

/** A member's press on a bot message in the group that really holds a button with this data; `extra` overrides any field. */
export function pressOn(data: string, extra: Partial<TgCallbackQuery> = {}): TgCallbackQuery {
  nextMessage += 1;
  const message: TgMessage = {
    message_id: nextMessage,
    date: Math.floor(NOW / 1000),
    chat: GROUP,
    from: BOT,
    text: "A message with a button",
    reply_markup: { inline_keyboard: [[{ text: "Press", callback_data: data }]] },
  };
  return { id: `press_${nextMessage}`, from: MEMBER, data, message, ...extra };
}

/** A group admin who can delete and restrict, unless `extra` says otherwise. */
export const adminInfo = (id: number, extra: Partial<AdminInfo> = {}): AdminInfo => ({
  id,
  name: "Alex Admin",
  username: null,
  creator: false,
  anonymous: false,
  canDelete: true,
  canRestrict: true,
  ...extra,
});

/**
 * Admins from a fixed list per chat, checked as community/admins.ts checks
 * them: anonymous admins never pass; delete and restrict need the right or
 * the creator; owner is the creator or an ID in `owners`. The bot holds both
 * rights. drop() forgets an admin at once.
 */
export function fakeAdmins(list: Record<number, AdminInfo[]> = {}, owners: number[] = []): Admins {
  const chats = new Map<ChatId, AdminInfo[]>(Object.entries(list).map(([chat, admins]) => [Number(chat), [...admins]]));
  const find = (chat: ChatId, user: number) => chats.get(chat)?.find((a) => a.id === user) ?? null;
  return {
    list: (chat) => chats.get(chat) ?? [],
    isAdmin: (chat, user) => find(chat, user) !== null,
    async can(chat, user, right) {
      const admin = find(chat, user);
      if (admin?.anonymous) return false;
      if (right === "owner") return admin?.creator === true || owners.includes(user);
      if (!admin) return false;
      if (right === "delete") return admin.creator || admin.canDelete;
      if (right === "restrict") return admin.creator || admin.canRestrict;
      return true;
    },
    botRights: async () => ({ delete: true, restrict: true }),
    refresh: async () => undefined,
    drop: (chat, user) => void chats.set(chat, (chats.get(chat) ?? []).filter((a) => a.id !== user)),
  };
}

/** One commit as an open budget saw it. */
export interface Settled {
  ticket: Ticket;
  usage: Usage | null;
  failure: ClaudeFailure | null;
}

/**
 * A budget that allows every request while on (setOn(false) turns it off)
 * and charges nothing. It records each reservation (tickets, with the model
 * each was reserved for), the ticket ID
 * of each commit in order (commits) with its usage and failure (settled),
 * and every failure and refusal reported to it.
 */
export function openBudget(): Budget & { commits: number[]; tickets: Ticket[]; settled: Settled[]; failures: ClaudeFailure[]; refusals: Lane[] } {
  const commits: number[] = [];
  const tickets: Ticket[] = [];
  const settled: Settled[] = [];
  const failures: ClaudeFailure[] = [];
  const refusals: Lane[] = [];
  let on = true;
  const status = (now: number): BudgetStatus => ({
    day: new Date(now).toISOString().slice(0, 10),
    spentUsd: 0,
    capUsd: 3,
    lanes: Object.fromEntries(LANES.map((lane) => [lane, { spentUsd: 0, capUsd: 3, calls: tickets.filter((t) => t.lane === lane).length }])) as BudgetStatus["lanes"],
    on,
    reason: on ? null : "admin",
    until: null,
    refusals: refusals.length,
    errors: failures.length,
  });
  return {
    commits,
    tickets,
    settled,
    failures,
    refusals,
    available: () => on,
    reserve(lane, worstUsd, _now, model) {
      if (!on) return null;
      const ticket = { id: tickets.length + 1, lane, worstUsd, model };
      tickets.push(ticket);
      return ticket;
    },
    commit(ticket, usage, failed) {
      commits.push(ticket.id);
      settled.push({ ticket, usage, failure: failed });
      return 0;
    },
    failed: (kind) => void failures.push(kind),
    refused: (lane) => void refusals.push(lane),
    setOn: (value) => {
      on = value;
    },
    status,
  };
}
