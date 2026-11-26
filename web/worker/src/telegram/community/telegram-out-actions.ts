import type { Sender } from "../sender";
import type { TgChatPermissions } from "../types";
import type { CommunityOut } from "./out";
import { LIFTED } from "./permissions";
import type { ChatId, UserId } from "./types";

/** Telegram reads an end less than 30 seconds ahead, or more than 366 days ahead, as forever. */
const MIN_AHEAD_S = 31;
const MAX_AHEAD_S = 365 * 86_400;
const PERMISSIONS = Object.keys(LIFTED) as Array<keyof TgChatPermissions>;

/** Every one of the 16 permissions true: a lift, the only restriction that may be sent without an end. */
const lifts = (p: TgChatPermissions) => PERMISSIONS.every((key) => p[key] === true);
const validChat = (chat: unknown): chat is ChatId => typeof chat === "number" && Number.isSafeInteger(chat) && chat !== 0;
const validUser = (user: unknown): user is UserId => typeof user === "number" && Number.isSafeInteger(user) && user > 0;

/** The end sent to Telegram at `nowMs`: at least 31 seconds and at most a year ahead, so it never reads as forever. */
export function untilDate(untilUnix: number, nowMs: number): number {
  const now = Math.floor(nowMs / 1_000);
  return Math.min(Math.max(Math.floor(untilUnix), now + MIN_AHEAD_S), now + MAX_AHEAD_S);
}

export type MemberActions = Pick<CommunityOut, "restrict" | "restore" | "ban" | "unban" | "kick" | "banSenderChat">;

export interface MemberActionsDeps {
  sender: Sender;
  log: (line: string) => void;
  now: () => number;
  /** Called after each action on a member: what Telegram said about them before may no longer hold. */
  changed: (chat: ChatId, user: UserId) => void;
}

/**
 * Restrictions, bans, unbans and removals, each one call through
 * sender.direct in the moderation lane (first of the shared 25 a second).
 * None throws: a refusal is false, already logged by the Sender with
 * Telegram's own words.
 */
export function createMemberActions(deps: MemberActionsDeps): MemberActions {
  const { sender } = deps;

  async function act(method: string, chat: ChatId, user: UserId, params: Record<string, unknown>): Promise<boolean> {
    if (!validChat(chat) || !validUser(user)) return false;
    const done = (await sender.direct(method, params, { priority: "act" })) !== null;
    deps.changed(chat, user);
    return done;
  }

  /** restrictChatMember; 0 sends no end (forever), which only a lift or a restored restriction may. */
  function restrictUntil(chat: ChatId, user: UserId, permissions: TgChatPermissions, untilUnix: number): Promise<boolean> {
    const base = { chat_id: chat, user_id: user, permissions, use_independent_chat_permissions: true };
    const now = deps.now;
    // A getter, read when each attempt is written (JSON.stringify), so a call that waited in line or after a 429 still sends an end at least 31 seconds ahead.
    const params = untilUnix === 0 ? base : { ...base, get until_date() { return untilDate(untilUnix, now()); } };
    return act("restrictChatMember", chat, user, params);
  }

  return {
    restrict(chat, user, permissions, untilUnix) {
      if (!Number.isFinite(untilUnix)) return Promise.resolve(false);
      if (untilUnix === 0 && !lifts(permissions)) {
        // It would last forever: only LIFTED may go without an end.
        deps.log("a restriction without an end was refused");
        return Promise.resolve(false);
      }
      return restrictUntil(chat, user, permissions, untilUnix);
    },

    restore(chat, user, permissions, untilUnix) {
      if (!Number.isFinite(untilUnix) || untilUnix < 0) return Promise.resolve(false);
      return restrictUntil(chat, user, permissions, Math.floor(untilUnix));
    },

    ban: (chat, user) => act("banChatMember", chat, user, { chat_id: chat, user_id: user }),

    unban: (chat, user) => act("unbanChatMember", chat, user, { chat_id: chat, user_id: user, only_if_banned: true }),

    // Without only_if_banned, unbanChatMember removes a member and lets them rejoin: one call, so a delay can never leave a ban behind.
    kick: (chat, user) => act("unbanChatMember", chat, user, { chat_id: chat, user_id: user }),

    async banSenderChat(chat, senderChat) {
      if (!validChat(chat) || !validChat(senderChat)) return false;
      return (await sender.direct("banChatSenderChat", { chat_id: chat, sender_chat_id: senderChat }, { priority: "act" })) !== null;
    },
  };
}
