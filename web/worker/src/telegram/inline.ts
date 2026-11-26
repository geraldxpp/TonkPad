import type { Locale } from "@/shared/i18n/config";
import type { Token } from "@/shared/types/token";
import { aiOn, groupAiOn } from "./commands";
import type { BotContext, InlineArticle } from "./context";
import { botLocale, words } from "./i18n";
import { askQuestion } from "./inline-ask";
import { type AskChat, askChatOf, askResultId } from "./inline-pending";
import { ANSWER_MS, QUIET_MS, RETRY_MS } from "./inline-wait";
import { findAddress, plainText } from "./text";
import type { TgChosenInlineResult, TgInlineQuery } from "./types";
import { cardView } from "./views";

export { ASK_CHARS, askQuestion, type Asked } from "./inline-ask";
export { type AskChat, askChatOf, askResultId } from "./inline-pending";
export { inlineLimits } from "./inline-wait";

/**
 * Inline mode (module 14): @bot <address> offers that token's card in any
 * chat, at once. A message that starts with @bot is an inline query, which
 * Telegram gives no send button, so a question also gets "Ask TonkFun"
 * where something answers it (inline-ask.ts): the result posts only a fixed
 * line in the asker's language, as their own plain message via the bot, and
 * Telegram's chosen_inline_result (onChosen) brings the bot the question it
 * was chosen for, with the result's ID, which names the kind of chat Ask
 * was offered in; the post is paired with a question from its own kind of
 * chat (inline-pending.ts) and answered as /ask in the community groups and
 * the bot's own chat. Typing sends a query at each pause, so text is
 * answered only once its typist pauses (inline-wait.ts InlineTyping): a
 * newer query cancels the older one. Inline mode itself never calls the
 * model and never reaches the community agent; it only asks whether AI
 * answers are on (commands.ts).
 */

/** A token's card offered in any chat through inline mode (@bot <address>). */
export function inlineArticle(token: Token, lang: Locale, site: string): InlineArticle {
  const d = words(lang);
  const card = cardView(token, lang, site, { shared: true });
  return {
    type: "article",
    id: token.address.slice(0, 64),
    title: `${plainText(token.name, 40)} · ${plainText(token.ticker, 16)}`,
    description: d.card.score.replace("{score}", String(Math.round(token.score))).replace("{level}", d.levels[token.level]),
    input_message_content: { message_text: card.text, parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    reply_markup: card.keyboard,
  };
}

/** Where AI answers are on, as Ask's description says: in the community groups and private chats, or only one of them. */
export type AskWhere = "both" | "group" | "private";

/**
 * "Ask TonkFun" in the asker's language, titled with their question (only
 * they see the results): it posts the fixed line (inline.askPosted) as their
 * own plain message, with no parse mode, link preview or buttons. Its ID
 * names the kind of chat it is offered in (inline-pending.ts askResultId),
 * which the chosen result tells nowhere else.
 */
export function askArticle(question: string, lang: Locale, chat: AskChat, where: AskWhere = "both"): InlineArticle {
  const d = words(lang).inline;
  return {
    type: "article",
    id: askResultId(chat),
    title: d.askAs.replace("{question}", () => question),
    description: { both: d.askWhere, group: d.askWhereGroup, private: d.askWherePrivate }[where],
    input_message_content: { message_text: d.askPosted, link_preview_options: { is_disabled: true } },
  };
}

/**
 * Whether Ask is offered where the query is typed, in which kind of chat,
 * and what is on: the bot's own chat ("sender", kind "p") while AI answers
 * in private chats, a supergroup (kind "g"; a community group always is one)
 * while the community agent answers in its groups (commands.ts aiOn and
 * groupAiOn, as /help and the home menu decide); never a basic group, which
 * it never answers, a channel, a chat with someone else or a secret chat
 * (no chat type).
 */
function askOn(chatType: string | undefined, ctx: BotContext): { chat: AskChat; where: AskWhere } | null {
  if (chatType !== "sender" && chatType !== "supergroup") return null;
  const inGroups = groupAiOn(ctx);
  const inPrivate = aiOn(ctx);
  if (chatType === "sender" ? !inPrivate : !inGroups) return null;
  return { chat: chatType === "sender" ? "p" : "g", where: inGroups && inPrivate ? "both" : inGroups ? "group" : "private" };
}

/**
 * A text query, answered: the person's allowance first (counted once; a
 * retry isn't counted again), then everyone's text budget; past that it
 * waits and tries again while it is fresh (ANSWER_MS after `since`, when it
 * came), or, without InlineTyping, gets no answer. Then Ask, the /ask
 * button or the usual help.
 */
async function answerText(q: TgInlineQuery, ctx: BotContext, since: number, counted = false): Promise<void> {
  const now = ctx.now();
  const offer = askOn(q.chat_type, ctx);
  // Where Ask is offered, a person's text has its own allowance (inlineLimits); elsewhere it counts as a lookup does.
  if (!counted && !(offer ? ctx.inlineText : ctx.inlineLimiter).allow(q.from.id, now)) return;
  if (!ctx.inlineTextAll.allow(0, now)) {
    if (ctx.inlineTyping && now + RETRY_MS - since <= ANSWER_MS) ctx.inlineTyping.wait(q.from.id, RETRY_MS, later(q, ctx, since, true));
    return;
  }
  const lang = botLocale(q.from.language_code);
  const d = words(lang).inline;
  if (!offer) return ctx.out.inline(q.id, [], d.help);
  const asked = askQuestion(q.query);
  if ("question" in asked) return ctx.out.inline(q.id, [askArticle(asked.question, lang, offer.chat, offer.where)], d.help);
  await ctx.out.inline(q.id, [], asked.refused === "unsafe" ? d.askNo : d.help);
}

/** answerText from a timer, which nothing awaits: a failure is noted (no ID, no text), never thrown. */
const later = (q: TgInlineQuery, ctx: BotContext, since: number, counted: boolean) => (): void =>
  void answerText(q, ctx, since, counted).catch(() => ctx.log?.("inline: an answer failed"));

export async function onInline(q: TgInlineQuery, ctx: BotContext): Promise<void> {
  const address = findAddress(typeof q.query === "string" ? q.query : "");
  if (address) {
    // An address gets its card at once, as always, or none and "Token not found"; it supersedes the person's waiting text.
    ctx.inlineTyping?.cancel(q.from.id);
    const now = ctx.now();
    if (!ctx.inlineLimiter.allow(q.from.id, now) || !ctx.inlineAll.allow(0, now)) return;
    const lang = botLocale(q.from.language_code);
    const token = ctx.data.ready() ? ctx.data.token(address) : null;
    return ctx.out.inline(q.id, token ? [inlineArticle(token, lang, ctx.site)] : [], words(lang).inline[token ? "help" : "notFound"]);
  }
  const typing = ctx.inlineTyping;
  if (!typing) return answerText(q, ctx, ctx.now());
  // Typing sends a query at each pause: only the person's newest text is answered, once they pause (a newer one cancels this).
  typing.wait(q.from.id, QUIET_MS, later(q, ctx, ctx.now(), false));
}

/**
 * Someone chose a result (Telegram sends this only while inline feedback is
 * on, which the bot turns on itself while Ask can be offered:
 * profile-settings.ts). For an Ask result, the question it was chosen for
 * waits for the person's post in the kind of chat its ID names
 * (inline-pending.ts), checked again as Ask checked it, and only while AI
 * answers are on somewhere; a card's, any other ID, anything from a bot and
 * anything else is ignored. Of the person, only their ID is read; nothing is
 * logged.
 */
export function onChosen(r: TgChosenInlineResult, ctx: BotContext): void {
  const store = ctx.pendingAsks;
  const chat = askChatOf(r.result_id);
  const from: unknown = r.from;
  if (!store || chat === null || typeof from !== "object" || from === null) return;
  const { id, is_bot: bot } = from as { id?: unknown; is_bot?: unknown };
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || bot === true || (!groupAiOn(ctx) && !aiOn(ctx))) return;
  const asked = askQuestion(r.query);
  if ("question" in asked) store.put(id, { question: asked.question, chat, at: ctx.now() });
}
