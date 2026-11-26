import type { ForceReply, InlineKeyboard, TgChatFull, TgChatMember, TgChatPermissions } from "../types";
import type { ChatId, UserId } from "./types";

/**
 * Each group's sends share one budget of about 20 messages a minute, served
 * in this order: checks first, then notices, then answers; alerts go to the
 * admin chat.
 */
export type SendKind = "check" | "notice" | "answer" | "alert";

export interface SendOptions {
  kind: SendKind;
  /** The message it replies to (sent anyway if that one is gone). */
  replyTo?: number;
  /** The forum topic (message_thread_id) of the message it answers. */
  thread?: number;
  keyboard?: InlineKeyboard;
  /** A reply field (the private Ask prompt); used only when there is no keyboard. */
  forceReply?: ForceReply;
  /** Also shows the text to this member alone (Telegram's ephemeral messages): best effort, never relied on. */
  ephemeralTo?: UserId;
  /** With ephemeralTo: send only the ephemeral copy, no public message (resolves null). */
  ephemeralOnly?: boolean;
}

/**
 * A fresh read never uses a kept answer (a join's check reads the joiner so),
 * waits in the lane after messages, so it never delays a restriction or a
 * removal, and comes back null when it can't go out within 5 seconds.
 */
export interface MemberRead {
  fresh?: boolean;
}

/**
 * Everything the community agent asks of Telegram (community/telegram-out.ts
 * over the Sender; tests use a recorder). No call throws: a failure comes
 * back as null or false, already logged without text. Messages are HTML with
 * link previews off. Moderation calls go first among Telegram's 25 a second,
 * then reads, messages, a join's fresh read, check edits and press answers
 * (sender-lanes.ts).
 */
export interface CommunityOut {
  /** The new message's ID, or null when it was dropped (the group's budget or queue is full) or Telegram refused it. */
  send(chat: ChatId, html: string, options: SendOptions): Promise<number | null>;
  /** Replaces a message's text and buttons (no keyboard removes them); false when it failed. */
  edit(chat: ChatId, messageId: number, html: string, keyboard?: InlineKeyboard): Promise<boolean>;
  /** Deletes messages, batched per chat (deleteMessages, up to 100 IDs). */
  remove(chat: ChatId, messageIds: readonly number[]): void;
  /** Deletes one of the bot's own messages later; delays past a minute survive a restart through the records. */
  removeLater(chat: ChatId, messageId: number, afterMs: number): void;
  /**
   * restrictChatMember with independent permissions. `untilUnix` is when it
   * ends, in unix seconds; 0 means never, and only LIFTED may use it.
   * Telegram treats a time less than 30 seconds ahead (or already past) as
   * forever, so this never sends one: such a time moves to just past 30
   * seconds from the moment of the call.
   */
  restrict(chat: ChatId, user: UserId, permissions: TgChatPermissions, untilUnix: number): Promise<boolean>;
  /**
   * Puts back a restriction Telegram reported for this member (a rejoiner's
   * own mute, which the check's restriction replaced): its permissions and
   * its end in unix seconds, where 0 means never, as Telegram said it.
   */
  restore(chat: ChatId, user: UserId, permissions: TgChatPermissions, untilUnix: number): Promise<boolean>;
  /** banChatMember, without an end. */
  ban(chat: ChatId, user: UserId): Promise<boolean>;
  /** Lifts a ban (unbanChatMember with only_if_banned), so they can rejoin; never removes a member. */
  unban(chat: ChatId, user: UserId): Promise<boolean>;
  /** Removes a member and lets them rejoin: one unbanChatMember call without only_if_banned, so a delay can't turn it into a ban. */
  kick(chat: ChatId, user: UserId): Promise<boolean>;
  /** Bans someone posting as a channel, by that channel's ID. */
  banSenderChat(chat: ChatId, senderChat: number): Promise<boolean>;
  /** "Typing…" in the chat (and topic), for at most 5 seconds. */
  typing(chat: ChatId, thread?: number): Promise<void>;
  /** Answers a button press (a toast when text is given); false when Telegram refused it, e.g. a press too old to answer. */
  answerPress(callbackId: string, text?: string): Promise<boolean>;
  /** getChatAdministrators, read from Telegram on every call (community/admins.ts keeps each group's list), or null. */
  admins(chat: ChatId): Promise<TgChatMember[] | null>;
  /** getChatMember (cached 10 minutes, but never an admin's answer, and forgotten after restrict, ban, unban or kick, or by forget), or null. */
  member(chat: ChatId, user: UserId, read?: MemberRead): Promise<TgChatMember | null>;
  /** Forgets this member's cached getChatMember answer (and a read under way): their membership changed, so the next member() asks Telegram. */
  forget(chat: ChatId, user: UserId): void;
  /** getChat (cached 10 minutes), or null. */
  chat(chat: ChatId): Promise<TgChatFull | null>;
  memberCount(chat: ChatId): Promise<number | null>;
  /** Whether a send of this kind would be queued now rather than dropped: checked before paying for an answer. */
  room(chat: ChatId, kind: SendKind): boolean;
}
