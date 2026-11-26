import { visibleText } from "../../text";
import { hideMarked, markedContacts } from "../agent/mask";
import { botLocale } from "../i18n";
import { findSecret } from "../mod/secrets";
import { escapeHtml as esc } from "../text";
import type { TgMessage, TgUser } from "../types";
import { crisisOf, crisisReply } from "./qa-crisis";
import { type Ask, isCrisis, MAX_QUESTION, note, type QaCtx, reply, standIn } from "./qa-reply";

/**
 * Questions in a private chat (prompts/15-community-agent.md, Where it
 * answers): /ask or a reply to the Ask prompt goes to the model at once;
 * free text is offered Ask first and waits for the press. What Telegram
 * marked as a phone number or an e-mail address never reaches the model,
 * nor waits for the press as written.
 */

export const privateAsk = (m: TgMessage, from: TgUser, question: string): Ask => ({
  chat: m.chat, user: from, author: from, messageId: m.message_id, question, earlierAnswer: null, cardAddress: null,
  lang: botLocale(from.language_code), where: "private", mode: "direct", media: false, contacts: markedContacts(m),
});

/** A private chat's person: not a bot, in their own chat. */
export const privatePerson = (m: TgMessage): TgUser | null => (m.chat.type === "private" && m.from && m.from.is_bot !== true && m.from.id === m.chat.id ? m.from : null);

/** A recovery phrase or key goes nowhere: removed from a private chat with the warning (in a group the rules removed it). */
export async function secret(a: Ask, ctx: QaCtx): Promise<void> {
  if (a.where !== "private") return;
  ctx.out.remove(a.chat.id, [a.messageId]);
  await reply(a, { text: esc(ctx.words(a.lang).safety.secretPrivate) }, ctx);
}

/** /ask (or the prompt's reply) in a private chat; false when private answers are off here. */
export async function askPrivate(m: TgMessage, question: unknown, ctx: QaCtx, ask: (a: Ask) => Promise<unknown>): Promise<boolean> {
  try {
    const from = privatePerson(m);
    const q = visibleText(typeof question === "string" ? question : "");
    if (!from || !ctx.privateAi || !ctx.client || !ctx.budget || q === "") return false;
    await ask(privateAsk(m, from, q));
  } catch {
    ctx.log("a private question wasn't answered");
  }
  return true;
}

/** Free text in a private chat: offered Ask, and held (its marked contacts already hidden) until the press. */
export async function offerPrivate(m: TgMessage, text: unknown, ctx: QaCtx): Promise<boolean> {
  try {
    const from = privatePerson(m);
    const q = visibleText(typeof text === "string" ? text : "");
    if (!from || !ctx.privateAi || !ctx.budget || !ctx.client || q === "") return false;
    const a = privateAsk(m, from, q);
    if (findSecret(q) !== null) await secret(a, ctx);
    else if (isCrisis(q)) await crisisReply(crisisOf(a), ctx);
    else if ([...q].length > MAX_QUESTION) await standIn(a, "tooLong", ctx);
    else if (!ctx.budget.available("private", ctx.now())) await note(a, "paused", ctx);
    else {
      // Nothing goes to Anthropic until the member taps Ask: the text waits here, 10 minutes at most.
      ctx.asks.put(m.chat.id, m.message_id, { text: hideMarked(q, a.contacts), lang: a.lang, escalate: "none", at: ctx.now() });
      const w = ctx.words(a.lang);
      await reply(a, { text: esc(w.answer.askOffer), keyboard: { inline_keyboard: [[{ text: w.answer.askButton, callback_data: `a:${m.message_id}` }]] } }, ctx);
    }
  } catch {
    ctx.log("a private message wasn't offered");
  }
  return true;
}
