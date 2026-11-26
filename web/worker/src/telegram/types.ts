import type { TgChatMemberUpdated } from "./types-members";

/**
 * The small part of Telegram's Bot API (core.telegram.org/bots/api) the bot
 * uses. Updates come from Telegram and are untrusted: every field is optional
 * here and checked where it is read. The membership types are in
 * types-members.ts, re-exported here.
 */

export type { TgChatFull, TgChatMember, TgChatMemberUpdated, TgChatPermissions } from "./types-members";

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  /** Returned only by getMe: whether inline mode is switched on in @BotFather. */
  supports_inline_queries?: boolean;
  /** Returned only by getMe: true when privacy mode is off, so groups show the bot every message. */
  can_read_all_group_messages?: boolean;
  /** Returned only by getMe (BotFullInfo): every username the bot answers to, its collectible ones included. */
  active_usernames?: string[];
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  username?: string;
  title?: string;
  /** A supergroup with topics: messages there carry message_thread_id. */
  is_forum?: boolean;
}

/** A piece of a message Telegram marked up: a mention, a link, a phone number, a bot command… */
export interface TgMessageEntity {
  /** "mention", "url", "text_link", "text_mention", "phone_number", "email", "bot_command", … */
  type: string;
  /** In UTF-16 code units, as JavaScript counts a string. */
  offset: number;
  length: number;
  /** A text_link's real address. */
  url?: string;
  /** A text_mention's user. */
  user?: TgUser;
}

/** Where a forwarded message first came from. */
export interface TgMessageOrigin {
  type: "user" | "hidden_user" | "chat" | "channel";
  date: number;
  sender_user?: TgUser;
  sender_user_name?: string;
  sender_chat?: TgChat;
  chat?: TgChat;
}

export interface TgMessage {
  message_id: number;
  date: number;
  chat: TgChat;
  from?: TgUser;
  /** Set when someone writes as a chat (an anonymous group admin, or as their channel); `from` is then a placeholder bot. */
  sender_chat?: TgChat;
  /** The member tag shown beside the author's name in some groups; checked like a name. */
  sender_tag?: string;
  text?: string;
  /** A photo's, video's or document's words. */
  caption?: string;
  /** Telegram's markup of text, and of caption: mentions, links, text links, phone numbers, e-mails… */
  entities?: TgMessageEntity[];
  caption_entities?: TgMessageEntity[];
  reply_to_message?: TgMessage;
  /** A reply to a message in another chat (or a quote from one). */
  external_reply?: { origin?: TgMessageOrigin; chat?: TgChat };
  /** The topic a message belongs to, in a forum. */
  message_thread_id?: number;
  is_topic_message?: boolean;
  /** Present when the message opened a forum topic (its root). */
  forum_topic_created?: unknown;
  /** A forwarded message's first author. */
  forward_origin?: TgMessageOrigin;
  /** A channel post Telegram copied into the channel's discussion group by itself. */
  is_automatic_forward?: boolean;
  /** Set on an edited message: when it was last edited (unix seconds). */
  edit_date?: number;
  /** Sent through another bot's inline mode. */
  via_bot?: TgUser;
  /** Its buttons: on the bot's own messages, what a button press is checked against. */
  reply_markup?: InlineKeyboard;
  /** Service messages: who joined, and who left. */
  new_chat_members?: TgUser[];
  left_chat_member?: TgUser;
  /** Present on media a person sent; only checked for presence, and the fields below. */
  photo?: unknown;
  sticker?: { file_unique_id?: string };
  document?: { file_name?: string; mime_type?: string };
  video?: unknown;
  animation?: { file_unique_id?: string };
  voice?: unknown;
  audio?: unknown;
  video_note?: unknown;
  location?: unknown;
  venue?: unknown;
  contact?: unknown;
  poll?: unknown;
  dice?: unknown;
  /** Set on each item of an album: only the item with the caption has words. */
  media_group_id?: string;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  data?: string;
  /** The message the button was on; without reply_markup when it is too old for the bot to read. */
  message?: TgMessage;
  inline_message_id?: string;
}

export interface TgInlineQuery {
  id: string;
  from: TgUser;
  query: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
  inline_query?: TgInlineQuery;
  /** Someone's membership changed (sent only when asked for, and only to admins). */
  chat_member?: TgChatMemberUpdated;
  /** The bot's own membership changed: added, promoted, restricted or removed. */
  my_chat_member?: TgChatMemberUpdated;
}

export type Button =
  | { text: string; url: string }
  | { text: string; callback_data: string };

export interface InlineKeyboard {
  inline_keyboard: Button[][];
}

export interface ForceReply {
  force_reply: true;
  input_field_placeholder?: string;
  selective?: boolean;
}

/** A message the bot shows: HTML text and, optionally, its buttons or a reply prompt. */
export interface View {
  text: string;
  keyboard?: InlineKeyboard;
  forceReply?: ForceReply;
}

export interface BotCommand {
  command: string;
  description: string;
}
