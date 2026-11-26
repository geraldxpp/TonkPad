import { BOT_DICTIONARIES } from "../i18n";
import type { TgMessage } from "../types";

/**
 * What came through the bot's own inline mode, and what is a forward
 * (agent/triggers.ts re-exports all of it). Inline mode posts either a
 * token's card, which has buttons, or Ask's fixed line (inline.ts
 * askArticle: "Asked TonkFun a question." in the asker's language), never
 * anything a member typed: the question Ask was chosen for reaches the bot
 * alone, through Telegram's chosen_inline_result (inline-pending.ts). The
 * bot is via_bot, or a forward's sender, by its ID alone.
 */

/** The bot: its ID and every username it answers to (getMe's active_usernames). */
export type Me = { id: number; usernames: readonly string[] };

/**
 * Whether a user (untrusted, from Telegram) is the bot: by its ID alone.
 * Telegram always sends a user's ID, while a username can pass to another
 * account (one the bot dropped while the worker keeps its startup getMe).
 */
export function isMe(user: unknown, me: Me): boolean {
  if (typeof user !== "object" || user === null) return false;
  const { id } = user as { id?: unknown };
  return typeof id === "number" && id === me.id;
}

/**
 * A forward (Telegram keeps via_bot on it) or a channel post's automatic
 * copy in its discussion group: not its sender's own message, nor their
 * question or report (router.ts reads a forwarded /ask or /report in a
 * private chat as text).
 */
export const forwarded = (m: TgMessage): boolean => m.is_automatic_forward === true || (m.forward_origin !== undefined && m.forward_origin !== null);

/**
 * A forward of the bot's own message: forward_origin.type "user" whose
 * sender_user is the bot by its ID alone (isMe), never an account holding
 * one of its usernames; never before the bot knows itself. What the rules'
 * forwardSelf reads (mod/rules.ts brandForward).
 */
export function forwardedFromMe(m: TgMessage, me: Me | null): boolean {
  const origin: unknown = m.forward_origin;
  if (!me || typeof origin !== "object" || origin === null) return false;
  const { type, sender_user: user } = origin as { type?: unknown; sender_user?: unknown };
  return type === "user" && isMe(user, me);
}

/** What the bot's own inline mode posted (via_bot is the bot), forwarded or not: a token's card, which has buttons, or a plain message; null otherwise. */
export function viaMe(m: TgMessage, me: Me | null): "card" | "plain" | null {
  if (!me || !isMe(m.via_bot, me)) return null;
  return m.reply_markup !== undefined && m.reply_markup !== null ? "card" : "plain";
}

/** Ask's fixed line in each of the 12 languages (inline.askPosted). */
const ASK_LINES: ReadonlySet<string> = new Set(Object.values(BOT_DICTIONARIES).map((d) => d.inline.askPosted));

/** Whether a text, whole, is Ask's fixed line in one of the 12 languages. */
export const isAskLine = (text: unknown): boolean => typeof text === "string" && ASK_LINES.has(text);

/**
 * Ask's fixed line as inline mode posted it: via the bot, without buttons,
 * its whole text the line in any of the 12 languages; forwarded or not. Its
 * own text never goes to Haiku's check. A plain message via the bot with any
 * other text is no Ask, and never a question.
 */
export const askLine = (m: TgMessage, me: Me | null): boolean => viaMe(m, me) === "plain" && isAskLine(m.text);

/** A person's own Ask post: Ask's line, not forwarded, from a person (not as a chat, not a bot). The router pairs it with its question (inline-pending.ts). */
export function askPost(m: TgMessage, me: Me | null): boolean {
  const from = m.from;
  if (!askLine(m, me) || forwarded(m) || m.sender_chat || typeof from?.id !== "number") return false;
  return Number.isSafeInteger(from.id) && from.id > 0 && from.is_bot !== true;
}
