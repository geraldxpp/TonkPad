import type { LaunchpadId } from "@/shared/types/launchpad";
import type { Token } from "@/shared/types/token";
import type { Once } from "./community/hold";
import type { CommunityHooks } from "./community/types";
import type { PendingAsks } from "./inline-pending";
import type { InlineTyping } from "./inline-wait";
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

/** An inline result: a token's card (HTML, with its buttons), or the Ask result (its fixed line, plain text, no buttons: inline.ts). */
export interface InlineArticle {
  type: "article";
  id: string;
  title: string;
  description: string;
  input_message_content: { message_text: string; parse_mode?: "HTML"; link_preview_options: { is_disabled: true } };
  reply_markup?: InlineKeyboard;
}

/** Where answers go (index.ts sends them through the Sender; tests record them). */
export interface Out {
  /** `thread`: the forum topic of the message it answers, so the reply lands in that topic. */
  send(chat: TgChat, view: View, replyTo?: number, thread?: number): Promise<void>;
  edit(target: Target, view: View, chat?: TgChat): Promise<void>;
  /** Answers a button press (a toast when `text` is given); false when Telegram refused it, e.g. a press too old to answer. */
  answer(callbackId: string, text?: string): Promise<boolean>;
  inline(queryId: string, results: InlineArticle[], button: string): Promise<void>;
}

/** The bot as getMe describes it: its ID and every username it answers to (active_usernames included). */
export interface BotSelf {
  id: number;
  usernames: string[];
}

export interface BotContext {
  data: BotData;
  out: Out;
  site: string;
  /** The bot's @username once getMe has answered. */
  bot: () => string | null;
  /** The bot's ID and usernames once getMe has answered. */
  me: () => BotSelf | null;
  /** Inline mode is switched on in @BotFather (getMe's supports_inline_queries). */
  inline: () => boolean;
  now: () => number;
  /** Each person's actions (limiter), and their inline address lookups and their inline text where Ask isn't offered (inlineLimiter). */
  limiter: Limiter;
  inlineLimiter: Limiter;
  /** Each person's inline text where Ask is offered: typing a question sends one at each pause, so it has its own, larger allowance (inline-wait.ts inlineLimits). */
  inlineText: Limiter;
  /**
   * Shared by everyone (key 0): inline lookups' answers (inlineAll), inline
   * text's (inlineTextAll, apart, so people typing can't hold up a lookup),
   * and "slow down" toasts for presses past a person's limit (pressAll).
   */
  inlineAll: Limiter;
  inlineTextAll: Limiter;
  /**
   * Each person's newest inline text, answered once they pause (inline-wait.ts
   * InlineTyping), so a typing burst costs one answer; without it (the
   * router's tests) text is answered at once.
   */
  inlineTyping?: InlineTyping;
  /**
   * The questions people chose inline mode's Ask for, waiting for their
   * posts in the kind of chat each was offered in (inline-pending.ts): 60
   * seconds and 1,000 questions at most. Without it (the router's tests) no
   * question is kept, and an Ask post gets the note that says to use /ask.
   */
  pendingAsks?: PendingAsks;
  pressAll: Limiter;
  /**
   * Presses in a group that post a new message there (a token's card, or the
   * launches list under an AI answer): once per message and button in 10
   * minutes, so nobody can make the bot flood a group. Keys hold a group's ID
   * and the bot's own message ID, never a user ID.
   */
  groupPosts: Once;
  /**
   * The community agent and moderator (module 15), once it has started; absent
   * when it is off. Only allow-listed groups, the admin chat and private chats
   * reach it, each through its own call.
   */
  community?: CommunityHooks;
  /** Notes for the worker's log: group IDs at most, never a user ID or a message's text. */
  log?: (line: string) => void;
}
