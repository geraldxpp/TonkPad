/**
 * The small part of Telegram's Bot API (core.telegram.org/bots/api) the bot
 * uses. Updates come from Telegram and are untrusted: every field is optional
 * here and checked where it is read.
 */

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  language_code?: string;
  /** Returned only by getMe: whether inline mode is switched on in @BotFather. */
  supports_inline_queries?: boolean;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  username?: string;
}

export interface TgMessage {
  message_id: number;
  date: number;
  chat: TgChat;
  from?: TgUser;
  /** Set when someone writes as a chat (an anonymous group admin, or as their channel); `from` is then a placeholder bot. */
  sender_chat?: TgChat;
  text?: string;
  /** A photo's, video's or document's words. */
  caption?: string;
  reply_to_message?: TgMessage;
  /** Present on media a person sent; only checked for presence. */
  photo?: unknown;
  sticker?: unknown;
  document?: unknown;
  video?: unknown;
  animation?: unknown;
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
  callback_query?: TgCallbackQuery;
  inline_query?: TgInlineQuery;
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
