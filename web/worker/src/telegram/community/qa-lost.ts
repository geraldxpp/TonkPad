import { topicOf } from "../agent/triggers";
import { botLocale } from "../i18n";
import { escapeHtml as esc } from "../text";
import type { TgMessage } from "../types";
import type { QaCtx } from "./qa-reply";

/**
 * Inline mode's Ask post in a group whose question never came
 * (inline-pending.ts: none within 5 seconds, as while @BotFather's inline
 * feedback is off): the note that says to use /ask, in the asker's
 * language, replying to the post. Paced like the other notes, once per
 * chat per 10 minutes, and nothing when it can't be sent. Never for
 * someone posting as a chat, nor a bot.
 */
export async function lostNote(m: TgMessage, ctx: QaCtx): Promise<void> {
  const from = m.from;
  if (!from || from.is_bot === true || m.sender_chat || !ctx.notes.first(`${m.chat.id}:askLost`, ctx.now())) return;
  const text = esc(ctx.words(botLocale(from.language_code)).answer.askLost);
  await ctx.out.send(m.chat.id, text, { kind: "answer", replyTo: m.message_id, thread: topicOf(m) });
}
