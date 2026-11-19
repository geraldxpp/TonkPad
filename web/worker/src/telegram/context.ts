import type { LaunchpadId } from "@/shared/types/launchpad";
import type { Token } from "@/shared/types/token";
import type { Limiter } from "./limiter";
import type { InlineKeyboard, TgChat, View } from "./types";

/** What the bot reads: the worker's own tokens, never marking one opened (so no Helius credits). */
export interface BotData {
  ready(): boolean;
  token(address: string): Token | null;
  /** One launchpad's newest launches, newest first. */
  latest(pad: LaunchpadId, limit: number): Token[];
  trending(limit: number): Token[];
}

export type Target = { chatId: number; messageId: number } | { inlineId: string };

export interface InlineArticle {
  type: "article";
  id: string;
  title: string;
  description: string;
  input_message_content: { message_text: string; parse_mode: "HTML"; link_preview_options: { is_disabled: true } };
  reply_markup?: InlineKeyboard;
}

/** Where answers go (index.ts sends them through the Sender; tests record them). */
export interface Out {
  send(chat: TgChat, view: View, replyTo?: number): Promise<void>;
  edit(target: Target, view: View, chat?: TgChat): Promise<void>;
  /** Answers a button press (a toast when `text` is given); false when Telegram refused it, e.g. a press too old to answer. */
  answer(callbackId: string, text?: string): Promise<boolean>;
  inline(queryId: string, results: InlineArticle[], button: string): Promise<void>;
}

export interface BotContext {
  data: BotData;
  out: Out;
  site: string;
  /** The bot's @username once getMe has answered. */
  bot: () => string | null;
  /** Inline mode is switched on in @BotFather (getMe's supports_inline_queries). */
  inline: () => boolean;
  now: () => number;
  /** Each person's actions, and their inline queries. */
  limiter: Limiter;
  inlineLimiter: Limiter;
  /** Shared by everyone (key 0): inline answers, and "slow down" toasts for presses past a person's limit. */
  inlineAll: Limiter;
  pressAll: Limiter;
}
