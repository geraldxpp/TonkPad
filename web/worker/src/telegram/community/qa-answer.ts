import { isLocale, type Locale } from "@/shared/i18n/config";
import { ANSWER_SETTINGS, answerQuestion } from "../agent/answer";
import { gateAnswer, type Gated } from "../agent/gate";
import { officialNames } from "../agent/gate-handles";
import { typingBeats, withTyping } from "../agent/jobs";
import { maskedQuestion } from "../agent/mask";
import { answerView, type AnswerViewOptions, scoreLine } from "../agent/render";
import type { AnswerOutput, AnswerRequest, AnswerResult } from "../agent/types";
import { userCode } from "../claude/user-code";
import { BOT_DICTIONARIES } from "../i18n";
import { allAddresses } from "../mod/rules";
import { stopped } from "./qa-answer-stop";
import { crisisOf, crisisReply } from "./qa-crisis";
import { type Ask, counterChat, excerptOf, laneOf, linkOf, note, personOf, type QaCtx, reply, standIn, warnsFor } from "./qa-reply";
import type { Escalation } from "./types";
import type { CommunityDictionary } from "./words";

/**
 * One answer (prompts/15-community-agent.md, How it talks, and Human
 * attention): the request, the model's answer through the output gate, the
 * view code builds around it, and what goes with it: the team's alert for a
 * case that needs a person in a group, or the Share offer in a private chat.
 * A refusal or a max_tokens stop gets the fixed line and starts the asker's
 * 10-minute pause, as a timed-out answer does; only refusals count toward
 * the team's alert. Every reply that stands in for an answer carries the
 * DM warning when the question calls for it, or Haiku's check read a DM
 * scam in it. An unprompted answer goes out only when the facts answered it
 * and the gate let it through.
 */

/** Safe, Caution and Risky in every language: no answer may name a level (code writes the score line). */
const LEVEL_WORDS: readonly string[] = Object.values(BOT_DICTIONARIES).flatMap((d) => Object.values(d.levels));
/** Cases the Security page's contact handles: the answer points there, and nothing is shared from a private chat. */
const BUSINESS: ReadonlySet<Escalation> = new Set<Escalation>(["legal", "press", "listing", "partnership"]);

type Answered = Extract<AnswerResult, { kind: "answer" }>;

const addressKey = (address: string) => (/^0x/i.test(address) ? address.toLowerCase() : address);

function requestOf(a: Ask, ctx: QaCtx, now: number): AnswerRequest {
  return {
    question: maskedQuestion(a.question, a.contacts),
    earlierAnswer: a.earlierAnswer,
    cardAddress: a.cardAddress,
    askerAddresses: allAddresses(a.question),
    lang: a.lang,
    chat: a.where,
    mode: a.mode,
    lane: laneOf(a),
    date: new Date(now).toISOString().slice(0, 10),
    userCode: ctx.userCodeKey !== null ? userCode(ctx.userCodeKey, a.user.id, now) : null,
  };
}

/** What the answer adds: the flaw or business contact, "I've let the team know" in a group, the Share offer in a private chat. */
function extraOf(e: AnswerOutput["escalate"], share: boolean, a: Ask): AnswerViewOptions["extra"] {
  if (e === "none" || e === "crisis") return null;
  if (e === "security") return "flaw";
  if (BUSINESS.has(e)) return "business";
  if (a.where === "group") return "escalated";
  return share ? "shareAsk" : null;
}

/** The score line, from the tool's data, when the answer is about the token the tool read. */
function scoreOf(result: Answered, w: CommunityDictionary, lang: Locale): string | null {
  const token = result.token;
  const about = result.output.token.trim();
  if (!token || (about !== "" && addressKey(about) !== addressKey(token.address))) return null;
  return scoreLine(token, w, BOT_DICTIONARIES[lang].levels[token.level]);
}

/** The answer's token, when the asker sent its address: its button, in a private chat only. */
function askerToken(a: Ask, output: AnswerOutput): string | null {
  const about = addressKey(output.token.trim());
  return about !== "" && allAddresses(a.question).includes(about) ? about : null;
}

/** A case that needs a person, from a group answer: the team's alert (no excerpt for a flaw). */
function alertTeam(a: Ask, e: Escalation, adminNote: string, ctx: QaCtx): void {
  ctx.alerts?.alert({
    chat: a.chat.id, kind: e, category: e, member: personOf(a.author), excerpt: e === "security" ? null : excerptOf(a.question), link: linkOf(a),
    done: null, aiGuess: adminNote.trim() || null, undo: null, messageId: a.messageId, routine: false, urgent: false,
  });
  ctx.records.count(a.chat.id, "escalated", ctx.now());
}

/** An unprompted answer: posted only when the facts answered it and the gate passed it; in observe mode only the admins see it. */
async function unprompted(a: Ask, result: Answered, gated: Gated, lang: Locale, ctx: QaCtx): Promise<void> {
  if (result.output.answered !== true || result.output.escalate !== "none" || gated.blocked !== null) return;
  const now = ctx.now();
  if (ctx.records.settings(a.chat.id).strictness === "observe") {
    // The model's words go in preview, shown with its own label; done carries only the bot's own.
    ctx.alerts?.alert({
      chat: a.chat.id, kind: "preview", category: null, member: null, excerpt: null, link: linkOf(a), done: null, preview: gated.text,
      aiGuess: null, undo: null, messageId: a.messageId, routine: true, urgent: false,
    });
    return;
  }
  if (!ctx.out.room(a.chat.id, "answer")) return;
  const w = ctx.words(lang);
  const dmWarning = warnsFor(a) && ctx.dmWarning(a.chat.id, now);
  const view = answerView(gated, w, ctx.site, ctx.bot(), { shared: true, lang, scoreLine: scoreOf(result, w, lang), tokenButton: null, dmWarning, extra: null, shareData: null });
  const id = await reply(a, view, ctx);
  if (id === null) return;
  ctx.answered.note(a.chat.id, a.messageId, id, now);
  ctx.proactive.noteAnswered(a.chat.id, a.user.id, now);
  ctx.records.count(a.chat.id, "proactive", now);
}

/** Shows an answer through the gate; true when it escalated the case itself (the team's alert, or the crisis reply). */
async function show(a: Ask, result: Answered, ctx: QaCtx): Promise<boolean> {
  const { output } = result;
  if (output.escalate === "crisis") {
    if (a.mode === "proactive") return false;
    await crisisReply(crisisOf(a), ctx);
    return a.where === "group";
  }
  const now = ctx.now();
  const lang: Locale = isLocale(output.language) ? output.language : a.lang;
  const w = ctx.words(lang);
  const allowed = new Set([...ctx.pack.current().addresses, ...result.addresses]);
  const gated = gateAnswer({
    output, facts: result.facts, allowedAddresses: allowed, chat: a.where, placeholder: w.answer.unverifiedAddress, levelWords: LEVEL_WORDS, official: officialNames(ctx.official),
  });
  if (a.mode === "proactive") {
    await unprompted(a, result, gated, lang, ctx);
    return false;
  }
  const e = output.escalate;
  const escalated = a.where === "group" && e !== "none";
  if (escalated) alertTeam(a, e, output.admin_note, ctx);
  // From a private chat the team hears only if the member taps Share: the question waits 10 minutes for it.
  const share = a.where === "private" && e !== "none" && e !== "security" && !BUSINESS.has(e) && ctx.alerts !== null;
  if (share) ctx.shares.put(a.chat.id, a.messageId, { text: a.question, lang, escalate: e, at: now });
  // A blocked answer stands in for one: it always carries the warning. A real one carries it once per 30 minutes in a group,
  // and always in a private chat, whose ID (the person's) isn't kept that long.
  const dmWarning = warnsFor(a) && (gated.blocked !== null || a.where === "private" || ctx.dmWarning(a.chat.id, now));
  if (dmWarning) ctx.warnings.first(`${a.chat.id}:${a.user.id}`, now);
  const view = answerView(gated, w, ctx.site, ctx.bot(), {
    shared: a.where === "group",
    lang,
    scoreLine: scoreOf(result, w, lang),
    tokenButton: a.where === "private" ? askerToken(a, output) : null,
    dmWarning,
    extra: extraOf(e, share, a),
    shareData: share ? String(a.messageId) : null,
  });
  const id = await reply(a, view, ctx);
  if (id === null) return escalated;
  const counted = counterChat(a, ctx);
  if (a.where === "group") ctx.answered.note(a.chat.id, a.messageId, id, now);
  if (counted !== null) ctx.records.count(counted, a.where === "group" ? "answers" : "private", now);
  return escalated;
}

/**
 * Asks the model and shows what comes back, with "typing…" while it writes,
 * until past its model's deadline (never for an unprompted answer). True when
 * the answer escalated its case itself: anything else leaves the check's
 * alert to the caller (answers#4).
 */
export async function answer(a: Ask, ctx: QaCtx): Promise<boolean> {
  const { client, budget, answerModel: model } = ctx;
  if (!client || !budget) return false;
  const deps = { client, budget, pack: ctx.pack, data: ctx.data, official: ctx.official, now: ctx.now, model };
  const work = () => answerQuestion(requestOf(a, ctx, ctx.now()), deps);
  const typing = { maxBeats: typingBeats(ANSWER_SETTINGS[model].deadlineMs) };
  const result = a.mode === "proactive" ? await work() : await withTyping(ctx.out, a.chat.id, a.thread, work, typing);
  if (result.kind === "answer") return show(a, result, ctx);
  if (a.mode === "proactive") return false;
  if (result.kind === "declined") await (result.reason === "invalid" ? standIn(a, "unsure", ctx) : stopped(a, result.reason, ctx));
  else if (result.reason === "too_long") await standIn(a, "unsure", ctx);
  else {
    // A timed-out answer pauses its asker for 10 minutes, as a max_tokens stop does: questions built to run long can't keep answers busy.
    if (result.reason === "timeout") ctx.limits.coolDown(a.user.id, ctx.now());
    await note(a, result.reason === "budget" ? "paused" : "busy", ctx);
  }
  return false;
}
