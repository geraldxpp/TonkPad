import type { Locale } from "@/shared/i18n/config";
import { crisisView } from "../agent/render";
import { topicOf } from "../agent/triggers";
import { botLocale } from "../i18n";
import type { TgChat, TgMessage, TgUser } from "../types";
import { messageLink } from "./alerts";
import { type Ask, excerptOf, personOf, type QaCtx } from "./qa-reply";

/** Who and where for the crisis reply: a person, or someone posting as a chat (no alert names them). */
export interface CrisisCase {
  chat: TgChat;
  messageId: number;
  thread?: number;
  person: TgUser | null;
  /** The ID the reply is paced by: the person's, or the chat they post as. */
  key: number;
  text: string;
  lang: Locale;
  where: "group" | "private";
}

export const crisisOf = (a: Ask): CrisisCase => ({ chat: a.chat, messageId: a.messageId, thread: a.thread, person: a.author, key: a.author.id, text: a.question, lang: a.lang, where: a.where });

/**
 * The fixed, human-written reply to someone at risk, with the helpline
 * button: never a fallback and never an offence, once per member per 10
 * minutes. In a group the admins get an urgent alert first; from a private
 * chat nothing reaches the team unless the member chooses.
 */
export async function crisisReply(c: CrisisCase, ctx: QaCtx): Promise<void> {
  const now = ctx.now();
  if (!ctx.crises.first(`${c.chat.id}:${c.key}`, now)) return;
  const home = c.where === "group" ? c.chat.id : ctx.home;
  if (home !== null) ctx.records.count(home, "crisis", now);
  if (c.where === "group") {
    const link = messageLink(c.chat, c.messageId, c.thread);
    ctx.alerts?.alert({
      chat: c.chat.id, kind: "crisis", category: "crisis", member: c.person ? personOf(c.person) : null, excerpt: excerptOf(c.text), link,
      done: null, aiGuess: null, undo: null, messageId: c.messageId, routine: false, urgent: true,
    });
    ctx.records.count(c.chat.id, "escalated", now);
  }
  const view = crisisView(ctx.words(c.lang), ctx.helplineUrl);
  await ctx.out.send(c.chat.id, view.text, { kind: c.where === "group" ? "notice" : "answer", replyTo: c.messageId, thread: c.thread, keyboard: view.keyboard });
}

/** The crisis reply to a message (pipeline-crisis.ts paces a group's): its person, or the chat someone posts as; nobody for a bot. */
export async function crisisOfMessage(m: TgMessage, ctx: QaCtx): Promise<void> {
  const person = m.sender_chat ? null : m.from && m.from.is_bot !== true ? m.from : null;
  const key = person?.id ?? m.sender_chat?.id;
  if (key === undefined) return;
  const text = typeof m.text === "string" ? m.text : typeof m.caption === "string" ? m.caption : "";
  const where = m.chat.type === "private" ? "private" : "group";
  await crisisReply({ chat: m.chat, messageId: m.message_id, thread: topicOf(m), person, key, text, lang: person ? botLocale(person.language_code) : ctx.groupLang, where }, ctx);
}
