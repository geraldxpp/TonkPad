import { visibleText } from "../../text";
import { ANSWER_SETTINGS } from "../agent/answer";
import { markedContacts } from "../agent/mask";
import type { Candidate } from "../agent/proactive";
import { repliedTo, topicOf, type Trigger } from "../agent/triggers";
import { botLocale } from "../i18n";
import { isQuestion } from "../mod/rules";
import { findSecret } from "../mod/secrets";
import type { TgCallbackQuery, TgMessage } from "../types";
import { createOnce } from "./hold";
import { answer } from "./qa-answer";
import { crisisOf, crisisOfMessage, crisisReply } from "./qa-crisis";
import { createGap } from "./qa-gap";
import { onQaPress } from "./qa-press";
import { askPrivate, offerPrivate, secret } from "./qa-private";
import { type Ask, type Checked, flawView, isCrisis, isFlaw, laneOf, MAX_QUESTION, note, type QaCtx, type QaDeps, reply, standIn, warnAlone } from "./qa-reply";

export type { Checked, QaDeps } from "./qa-reply";

/**
 * The bot's answers (prompts/15-community-agent.md, Where it answers):
 * asked in a group, unprompted, and in a private chat. Before any call:
 * secrets are removed and sent nowhere, a person at risk gets the crisis
 * reply, AI must be on with room in its lane, the asker and the chat within
 * their limits, the question 600 characters at most and no flaw report, and
 * the answer's queue and Telegram's must have room. Every reply that
 * stands in for an answer carries the DM-scam warning when the question
 * calls for it (qa-reply.ts), and Haiku's check of a group question goes
 * with it: a DM scam it read adds the warning, and the case it found that
 * needs a person reaches the team when the answer doesn't escalate it
 * itself. Nothing here throws into the update loop.
 */
export interface Qa {
  /** A question to the bot whose message stands, or was removed only as a scam report (`gone`: replied to nothing); `checked` is what Haiku's check found, or null. */
  onTrigger(m: TgMessage, t: Trigger, checked?: Checked | null, gone?: boolean): Promise<void>;
  /** The busy note in place of an answer: no check could run, and the message carries a link, a handle or an address. */
  onBusy(m: TgMessage, t: Trigger): Promise<void>;
  onProactive(c: Candidate): Promise<void>;
  askPrivate(m: TgMessage, question: string): Promise<boolean>;
  offerPrivate(m: TgMessage, text: string): Promise<boolean>;
  onPress(q: TgCallbackQuery): Promise<boolean>;
  crisis(m: TgMessage): Promise<void>;
  /** Whether an unprompted candidate may be answered now: the group's settings, raid mode and the lane, then its limits, which count it. */
  allowProactive(c: Candidate, now: number): boolean;
  /** Forgets the notes', crisis replies', warnings' and refusals' keys past their 10 minutes: they hold chat and user IDs. */
  prune(now: number): void;
}

/** The paused, busy and cooldown notes, the crisis reply and the DM warning alone, each once per 10 minutes. */
const NOTE_MS = 10 * 60_000;
/** The DM warning alone, at most once every 2 minutes per group. */
const ALONE_MS = 2 * 60_000;
/** An answer that hasn't started within its model's answer deadline is dropped: 45 seconds on Haiku 5.5, 60 on Sonnet 5.5 and Opus 5.5. */
const waitMs = (ctx: QaCtx): number => ANSWER_SETTINGS[ctx.answerModel].deadlineMs;

const hasMedia = (m: TgMessage | null) =>
  m !== null && Boolean(m.photo || m.sticker || m.document || m.video || m.animation || m.voice || m.audio || m.video_note);

/** How asking ended: an answer queued (its run or its drop ends it), the crisis reply (which alerts the team itself), or anything else. */
type Ended = "queued" | "escalated" | "other";
const other = async (sent: Promise<unknown>): Promise<Ended> => {
  await sent;
  return "other";
};

export function createQa(deps: QaDeps): Qa {
  const ctx: QaCtx = { ...deps, notes: createOnce(NOTE_MS), crises: createOnce(NOTE_MS), warnings: createOnce(NOTE_MS), alone: createGap(ALONE_MS), refusals: createOnce(NOTE_MS) };
  const aiReady = () => ctx.client !== null && ctx.budget !== null;

  /** A group answer that can't be queued is skipped, but an asker at risk still gets the DM warning; a private asker hears "busy". */
  const busy = (a: Ask): Promise<void> => (a.where === "private" ? note(a, "busy", ctx) : warnAlone(a, ctx));
  /** The check's alert for a case that needs a person, when the answer path ended without escalating it (answers#4). */
  const unescalated = (a: Ask) => a.checked?.alert?.();

  async function run(a: Ask): Promise<void> {
    let escalated = false;
    try {
      // Checked again just before the call: an answer Telegram would drop is never paid for.
      if (a.mode === "direct" && !ctx.out.room(a.chat.id, "answer")) await busy(a);
      else escalated = await answer(a, ctx);
    } catch {
      ctx.log("an answer failed");
    }
    if (!escalated) unescalated(a);
  }

  /** An answer dropped past its deadline: the busy note to each asker at most once per 10 minutes (model#4), with the DM warning when called for (answers#8); past that, an asker at risk gets the warning alone. */
  async function dropped(a: Ask): Promise<void> {
    try {
      if (ctx.limits.busyReply(a.user.id, ctx.now())) await standIn(a, "busy", ctx);
      else await warnAlone(a, ctx);
    } catch {
      ctx.log("a dropped answer's note wasn't sent");
    }
    unescalated(a);
  }

  async function ask(a: Ask): Promise<Ended> {
    const now = ctx.now();
    const q = a.question;
    if (q === "") return a.media ? other(note(a, "textOnly", ctx)) : "other";
    if (findSecret(q) !== null) return other(secret(a, ctx));
    if (isCrisis(q)) {
      await crisisReply(crisisOf(a), ctx);
      return a.where === "group" ? "escalated" : "other";
    }
    const paused = a.where === "group" && ctx.records.settings(a.chat.id).paused;
    if (!ctx.client || !ctx.budget || paused || !ctx.budget.available(laneOf(a), now)) return other(note(a, "paused", ctx));
    const limit = ctx.limits.answer(a.user.id, a.where === "group" ? a.chat.id : null, now);
    if (limit !== "ok") return other(note(a, limit === "cooldown" ? "cooldown" : "busy", ctx));
    if ([...q].length > MAX_QUESTION) return other(standIn(a, "tooLong", ctx));
    if (isFlaw(q)) return other(reply(a, flawView(a, ctx), ctx));
    if (ctx.out.room(a.chat.id, "answer") && ctx.answers.push(String(a.chat.id), now + waitMs(ctx), () => run(a), () => void dropped(a))) return "queued";
    return other(busy(a));
  }

  /** Asks, then sends the check's alert when asking ended without an answer under way or escalating. */
  async function asked(a: Ask): Promise<void> {
    if ((await ask(a)) === "other") unescalated(a);
  }

  /** The question a trigger asks, as an Ask; null for someone posting as a chat, a bot, or /ask in reply to another member's remark. `gone`: `m` was removed. */
  function askOf(m: TgMessage, t: Trigger, checked: Checked | null, counts: boolean, gone = false): Ask | null {
    const from = m.from;
    // Someone posting as a chat (an anonymous admin, a channel) has no person to answer or pace.
    if (!from || from.is_bot === true || m.sender_chat) return null;
    const target = t.targetMessageId !== null ? repliedTo(m) : null;
    const author = t.target === "other" ? target?.from : from;
    if (!author || author.is_bot === true) return null;
    // /ask in reply to another member answers them only for a question, and counts as an unprompted answer.
    if (t.target === "other" && (!isQuestion(t.question) || (counts && !ctx.limits.proactive(m.chat.id, author.id, ctx.now())))) return null;
    return {
      chat: m.chat, user: from, author, messageId: t.targetMessageId ?? m.message_id, thread: topicOf(m), question: visibleText(t.question),
      earlierAnswer: t.earlierAnswer, cardAddress: t.cardAddress, lang: botLocale(from.language_code), where: "group", mode: "direct",
      media: hasMedia(target ?? m), contacts: markedContacts(m, target), checked, gone: gone && t.targetMessageId === null,
    };
  }

  return {
    async onTrigger(m, t, checked = null, gone = false) {
      try {
        const a = askOf(m, t, checked, true, gone);
        if (a) await asked(a);
        else checked?.alert?.();
      } catch {
        ctx.log("a question wasn't answered");
      }
    },

    async onBusy(m, t) {
      try {
        const a = askOf(m, t, null, false);
        if (a) await note(a, "busy", ctx);
      } catch {
        ctx.log("a busy note wasn't sent");
      }
    },

    async onProactive(c) {
      try {
        if (!aiReady()) return;
        // Observe mode sends a preview to the admins instead: the group's room doesn't matter then.
        const observe = ctx.records.settings(c.chat).strictness === "observe";
        if (!observe && !ctx.out.room(c.chat, "answer")) return;
        const a: Ask = {
          chat: { id: c.chat, type: "supergroup" }, user: { id: c.user }, author: { id: c.user }, messageId: c.messageId, thread: c.thread, question: c.text,
          earlierAnswer: null, cardAddress: null, lang: c.lang, where: "group", mode: "proactive", media: false,
        };
        ctx.answers.push(String(c.chat), ctx.now() + waitMs(ctx), () => run(a));
      } catch {
        ctx.log("an unprompted answer wasn't started");
      }
    },

    askPrivate: (m, question) => askPrivate(m, question, ctx, asked),
    offerPrivate: (m, text) => offerPrivate(m, text, ctx),
    onPress: (q) => onQaPress(q, ctx, asked),

    async crisis(m) {
      try {
        await crisisOfMessage(m, ctx);
      } catch {
        ctx.log("a crisis reply wasn't sent");
      }
    },

    allowProactive(c, now) {
      const s = ctx.records.settings(c.chat);
      if (!ctx.client || !ctx.budget || !s.proactive || s.paused || s.raidUntil > now || !ctx.budget.available("proactive", now)) return false;
      return ctx.limits.proactive(c.chat, c.user, now);
    },

    prune(now) {
      for (const once of [ctx.notes, ctx.crises, ctx.warnings, ctx.refusals, ctx.alone]) once.prune(now);
    },
  };
}
