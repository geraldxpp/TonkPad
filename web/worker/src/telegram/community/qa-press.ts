import { clip } from "../../text";
import { botLocale } from "../i18n";
import { escapeHtml as esc } from "../text";
import type { TgCallbackQuery, View } from "../types";
import { alertMember } from "./controls-people";
import { type Ask, excerptOf, type QaCtx } from "./qa-reply";
import type { CommunityDictionary } from "./words";

/**
 * The private chat's presses (prompts/15-community-agent.md, Where it
 * answers, and Human attention): Ask (a:<message>) sends the held text to
 * the model, Share (s:<message>) sends the held question to the team (until
 * the admin chat passed its checks, it says reports aren't set up yet and
 * sends nothing), and askp opens the Ask prompt. Each counts only in the
 * presser's own private chat, within the press limit, before any other call
 * to Telegram. Every press is answered, silently when nothing else is said,
 * so no spinner is left turning.
 */

/** Telegram holds at most 64 characters of a reply field's placeholder. */
const PLACEHOLDER_MAX = 64;

/** The Ask prompt, with a reply field so the answer to it is a question. */
export const promptView = (w: CommunityDictionary): View => ({
  text: esc(w.answer.askPrompt),
  forceReply: { force_reply: true, input_field_placeholder: clip(w.answer.askPlaceholder, PLACEHOLDER_MAX) },
});

const kindOf = (data: string): "askp" | "a" | "s" | null => (data === "askp" ? "askp" : data.startsWith("a:") ? "a" : data.startsWith("s:") ? "s" : null);

/** A press the Q&A flow owns; true when it was one (handled or ignored), false for any other. */
export async function onQaPress(q: TgCallbackQuery, ctx: QaCtx, ask: (a: Ask) => Promise<void>): Promise<boolean> {
  const kind = kindOf(typeof q.data === "string" ? q.data : "");
  if (kind === null) return false;
  let answered = false;
  const answer = (text?: string) => {
    answered = true;
    return ctx.out.answerPress(q.id, text);
  };
  try {
    const m = q.message;
    // Only in the presser's own private chat: what is held there is theirs alone. Elsewhere, or past the press limit, a silent answer.
    if (!m || m.chat.type !== "private" || m.chat.id !== q.from.id || q.from.is_bot === true || !ctx.limits.press(q.from.id, ctx.now())) {
      await answer();
      return true;
    }
    const now = ctx.now();
    const lang = botLocale(q.from.language_code);
    const w = ctx.words(lang);
    if (kind === "askp") {
      await answer();
      if (ctx.privateAi && ctx.client) await ctx.prompt(m.chat.id, promptView(w));
      return true;
    }
    // The admin chat hasn't passed its checks: nobody would see a share, so the member is never told the team has it.
    // The question stays held (10 minutes at most), so a press once the checks pass still shares it.
    if (kind === "s" && ctx.adminReady?.() === false) {
      await answer(w.report.noAdminChat);
      return true;
    }
    const id = Number((q.data ?? "").slice(2));
    const held = Number.isSafeInteger(id) && id > 0 ? (kind === "a" ? ctx.asks : ctx.shares).take(m.chat.id, id, now) : null;
    if (!held) {
      await answer(w.answer.askExpired);
      return true;
    }
    if (kind === "s") {
      // Shared by the member's choice: their name, username and question, never their ID. (Share is offered only with an admin chat.)
      ctx.alerts?.alert({
        chat: null, kind: held.escalate === "none" ? "unsure" : held.escalate, category: held.escalate === "none" ? "unsure" : held.escalate,
        member: alertMember(q.from, false), excerpt: excerptOf(held.text), link: null, done: null, aiGuess: null, undo: null, messageId: null,
        routine: false, urgent: held.escalate === "crisis",
      });
      if (ctx.home !== null) ctx.records.count(ctx.home, "escalated", now);
      await answer(w.answer.shared);
      return true;
    }
    await answer();
    await ask({ chat: m.chat, user: q.from, author: q.from, messageId: id, question: held.text, earlierAnswer: null, cardAddress: null, lang: held.lang, where: "private", mode: "direct", media: false });
  } catch {
    ctx.log("a private press wasn't handled");
    if (!answered) await answer();
  }
  return true;
}
