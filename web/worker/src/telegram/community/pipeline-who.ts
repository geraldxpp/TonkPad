import type { Locale } from "@/shared/i18n/config";
import { botLocale } from "../i18n";
import { nameHash } from "../mod/names";
import { DAY_MS, NEWCOMER_DAYS } from "../mod/newcomers-view";
import type { TgChat, TgChatMember, TgMessage, TgUser } from "../types";
import { fullName } from "./controls-people";
import type { CommunityOut } from "./out";
import type { AdminInfo, Admins, ChatId, Records, Standing, Strictness, UserId } from "./types";

/**
 * Who wrote a message in a community group (prompts/15-community-agent.md,
 * Who's who): an admin (Telegram's list, an anonymous admin writing as the
 * group, or the team's channel), a trusted member, a new member (seen
 * joining, or a commenter on a channel post who never joined), or a member.
 * Someone posting as another channel is moderated by that channel's ID. An
 * administrator with a title only (no right to delete or restrict, not the
 * creator) is moderated as a trusted member, since such accounts get hacked
 * too. Another bot is an admin when the group made it one or it is in
 * TELEGRAM_ALLOWED_BOTS; any other bot is read by the certain rules alone.
 */

export interface Who {
  standing: Standing;
  /** The person, or null for someone posting as a chat. */
  user: UserId | null;
  /** The channel someone posts as (moderated by its ID), or null. */
  senderChat: number | null;
  /** For the rules' name check and the admins' alerts only: never shown in the group. */
  name: string;
  username: string | null;
  tag: string | null;
  /** The author's app language (the group's for a chat). */
  lang: Locale;
  /** Trusted, under the name they had when trusted: the name rule is skipped. */
  trustedName: boolean;
  /** An administrator with a title only, moderated as trusted (and read for fake support too). */
  titled?: boolean;
  /** Another bot writing as itself: never answered or checked by Haiku; the certain rules only, unless it is an admin or allowed. */
  bot?: boolean;
}

export interface WhoDeps {
  out: CommunityOut;
  records: Records;
  admins: Admins;
  /** A chat whose posts are the team's: the official channel, or the group's own linked channel. */
  teamChat: (chat: ChatId, sender: TgChat) => boolean;
  /** A discussion group (one with a linked channel): people who never joined may comment there. */
  discussion: (chat: ChatId) => boolean;
  groupLang: Locale;
  strictness: (chat: ChatId) => Strictness;
  /** TELEGRAM_ALLOWED_BOTS (lower case, without @): bots non-admins may add, never moderated. None when not given. */
  allowedBots?: readonly string[];
}

/** A commenter's getChatMember answer is used again for this long (the privacy page's 10 minutes). */
const COMMENTER_MS = 10 * 60_000;
const COMMENTER_MAX = 5_000;
/** getChatMember gets this long; past it the commenter counts as new for that message, and Telegram is asked again next time. */
const MEMBER_WAIT_MS = 3_000;

/** A Telegram call that may hang: its answer, or null after `ms`. */
async function within<T>(work: Promise<T | null>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work.catch(() => null), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** A comment under a channel post: a reply to its automatic copy, or in its comment thread (not a forum topic). */
const isComment = (m: TgMessage) => m.reply_to_message?.is_automatic_forward === true || (typeof m.message_thread_id === "number" && m.is_topic_message !== true);
/** Not in the group: never joined (left), or restricted without being a member. */
const outside = (member: TgChatMember) => member.status === "left" || (member.status === "restricted" && member.is_member !== true);
/** An administrator with neither Delete messages nor Ban users, and not the creator: a title only, moderated as a trusted member and open to reports. */
export const titleOnly = (admin: AdminInfo | null): boolean => admin !== null && !admin.creator && !admin.canDelete && !admin.canRestrict;

/** A real admin, never moderated and never reported: the creator, or an administrator with Delete messages or Ban users. An administrator with a title only isn't one. */
export function realAdmin(admins: Pick<Admins, "list">, chat: ChatId, user: UserId): boolean {
  const admin = admins.list(chat).find((a) => a.id === user) ?? null;
  return admin !== null && !titleOnly(admin);
}

export function createWho(deps: WhoDeps): { of(m: TgMessage, now: number): Promise<Who | null>; standing(chat: ChatId, user: UserId, now: number): Standing; prune(now: number): void } {
  const { records, admins } = deps;
  /** "<chat>:<user>" → whether Telegram said they're outside the group, and when it was asked. Only real answers are kept. */
  const commenters = new Map<string, { left: boolean; at: number }>();

  /** Whether a commenter with no record never joined; null when Telegram didn't answer in time (nothing is kept then). */
  async function neverJoined(chat: ChatId, user: UserId, now: number): Promise<boolean | null> {
    const key = `${chat}:${user}`;
    const known = commenters.get(key);
    if (known && now - known.at < COMMENTER_MS) return known.left;
    const member = await within<TgChatMember>(deps.out.member(chat, user), MEMBER_WAIT_MS);
    if (!member || typeof member.status !== "string") return null;
    const left = outside(member);
    commenters.delete(key);
    commenters.set(key, { left, at: now });
    for (const oldest of commenters.keys()) {
      if (commenters.size <= COMMENTER_MAX) break;
      commenters.delete(oldest);
    }
    return left;
  }

  const adminOf = (chat: ChatId, user: UserId): AdminInfo | null => admins.list(chat).find((a) => a.id === user) ?? null;

  /** A person's standing from the admin list and the records alone; an administrator with a title only is trusted here. */
  function standing(chat: ChatId, user: UserId, now: number): Standing {
    if (admins.isAdmin(chat, user)) return titleOnly(adminOf(chat, user)) ? "trusted" : "admin";
    return records.isTrusted(chat, user) ? "trusted" : records.isNewcomer(chat, user, now) ? "new" : "member";
  }

  /** Another bot: an admin when the group made it one or TELEGRAM_ALLOWED_BOTS names it, else read by the certain rules. */
  function bot(chat: ChatId, from: TgUser, tag: string | null): Who {
    const username = typeof from.username === "string" && from.username !== "" ? from.username : null;
    const allowed = username !== null && (deps.allowedBots ?? []).includes(username.toLowerCase());
    const admin = admins.isAdmin(chat, from.id) || allowed;
    return { standing: admin ? "admin" : "member", user: from.id, senderChat: null, name: fullName(from), username, tag, lang: deps.groupLang, trustedName: true, bot: true };
  }

  return {
    standing,

    async of(m, now) {
      const chat = m.chat.id;
      const tag = typeof m.sender_tag === "string" && m.sender_tag !== "" ? m.sender_tag : null;
      const sender = m.sender_chat;
      if (sender && Number.isSafeInteger(sender.id)) {
        const team = sender.id === chat || deps.teamChat(chat, sender);
        const name = typeof sender.title === "string" ? sender.title : "";
        return { standing: team ? "admin" : "member", user: null, senderChat: team ? null : sender.id, name, username: sender.username ?? null, tag, lang: deps.groupLang, trustedName: false };
      }
      const from = m.from;
      if (!from || !Number.isSafeInteger(from.id) || from.id <= 0) return null;
      if (from.is_bot === true) return bot(chat, from, tag);
      const name = fullName(from);
      const base = { user: from.id, senderChat: null, name, username: from.username ?? null, tag, lang: botLocale(from.language_code), trustedName: false };
      // A title only: trusted for moderation; the name rule is skipped, since the admins' own names are what it compares against.
      if (admins.isAdmin(chat, from.id)) return titleOnly(adminOf(chat, from.id)) ? { ...base, standing: "trusted", trustedName: true, titled: true } : { ...base, standing: "admin" };
      const known = standing(chat, from.id, now);
      if (known === "trusted") return { ...base, standing: known, trustedName: records.trustedName(chat, from.id, nameHash(name)) };
      if (known !== "member" || !deps.discussion(chat) || !isComment(m)) return { ...base, standing: known };
      const left = await neverJoined(chat, from.id, now);
      if (left === false) return { ...base, standing: known };
      // A commenter who never joined is new for the group's newcomer days, as if the bot had seen them join.
      if (left === true) records.markNewcomer(chat, from.id, now, now + NEWCOMER_DAYS[deps.strictness(chat)] * DAY_MS);
      // When Telegram couldn't say, they count as new for this message only, and are asked about again next time.
      return { ...base, standing: "new" };
    },

    prune(now) {
      for (const [key, entry] of commenters) if (now - entry.at >= COMMENTER_MS) commenters.delete(key);
    },
  };
}
