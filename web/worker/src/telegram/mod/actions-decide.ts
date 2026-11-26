import { type AlertKind, type Decision, ESCALATIONS, type ModAction, type NoticeKind, type OffenceRecord, type RuleCategory, type RuleHit, type Standing, type Strictness, type TriageVerdict } from "../community/types";
import { after, byRule, DEL, type Draft, lead, noticeFor, strongest } from "./actions-rules";
import { DAY_S, ladderStep } from "./ladder";

/**
 * What moderation does with a message (prompts/15-community-agent.md,
 * Moderation): the rules' hits act at once, Haiku's verdict decides only
 * what the rules can't, and a ban comes only from a rule-certain case or the
 * ladder's last step after one. Pure: mod/actions.ts applies the result.
 */

export interface DecideContext {
  standing: Standing;
  strictness: Strictness;
  /** The member's offences still counting, before this message. */
  offences: OffenceRecord;
  raid: boolean;
  /** Posted as a channel: moderated by that channel's ID. */
  senderChat: boolean;
  /** Arrived while the worker was down (older than 5 minutes): certain rules only, deletes only. */
  stale: boolean;
  /**
   * A strong self-harm phrase, or Haiku's crisis flag: never punished, but
   * still moderated. Deletes stand (a link, a file, a flood's burst, a
   * secret); no offence, warning, mute, ban or removal follows.
   */
  spare?: boolean;
}

/** A decision, with Haiku's one-line reason when its verdict shaped it (shown to admins, labelled "AI's guess"). */
export interface ModDecision extends Decision {
  aiGuess: string | null;
}

/** Deletes that protect members even in observe mode. */
const PROTECTIVE: ReadonlySet<RuleCategory> = new Set<RuleCategory>(["secret", "secret_probable", "lookalike", "phishing"]);
/** Never judged by Haiku's verdict: secrets and flaw reports never reach it, and reporting a scam is never punished. */
const SHIELDS: ReadonlySet<RuleCategory> = new Set<RuleCategory>(["secret", "secret_probable", "security_report", "scam_report"]);
/** Scams: a channel identity posting one is banned by its ID, and a member's ban for one leaves older messages to the admins (mod/actions.ts). */
export const SCAMS: ReadonlySet<RuleCategory> = new Set<RuleCategory>(["lookalike", "phishing", "link_raid", "fake_support", "model_scam"]);
/** In raid mode these are summed up every 5 minutes (mod/raid.ts) instead of posted one by one. */
const SUMMED: ReadonlySet<NoticeKind> = new Set<NoticeKind>(["removed", "warned", "muted", "banned", "newcomer", "contact"]);
const NEEDS_PERSON: ReadonlySet<string> = new Set<string>(ESCALATIONS);
/** Notices that name a sanction: a spared decision that still deletes says only that something was removed. */
const SANCTIONS: ReadonlySet<NoticeKind> = new Set<NoticeKind>(["warned", "muted", "banned"]);
/** What another bot's message is checked for: the certain rules (and risky files); a hit deletes it and bans the bot. */
const BOT_RULES: ReadonlySet<RuleCategory> = new Set<RuleCategory>(["secret", "secret_probable", "lookalike", "phishing", "invite_link", "risky_file"]);

/**
 * What Haiku's verdict adds once the rules' decision on the same hits has
 * been applied: never a second delete or a second offence for one message,
 * never a ban, never anything for a scam report.
 */
function byVerdict(hits: readonly RuleHit[], v: TriageVerdict, ctx: DecideContext): { category: RuleCategory; draft: Draft } | null {
  if (v.verdict === "ok" || hits.some((h) => SHIELDS.has(h.category))) return null;
  const first = lead(hits);
  const rules = first ? byRule(first, ctx) : null;
  const done = rules?.actions ?? [];
  const deleted = done.some((a) => a.kind === "delete");
  const recorded = rules !== null && rules.offence !== "none";
  const del = deleted ? [] : [DEL];
  const quiet: Draft = { actions: del, offence: "none", notice: deleted ? null : "removed", alert: "action" };
  if (v.verdict === "unsure") {
    const hold = ctx.strictness === "strict" && !deleted;
    return { category: first?.category ?? "model_spam", draft: { actions: hold ? [DEL] : [], offence: "none", notice: hold ? "removed" : null, alert: "unsure" } };
  }
  if (v.verdict === "scam") {
    if (ctx.standing === "trusted") return { category: "model_scam", draft: quiet };
    const muted = strongest(done) >= DAY_S;
    const actions: ModAction[] = muted ? del : [...del, { kind: "mute", seconds: DAY_S }];
    return { category: "model_scam", draft: { actions, offence: recorded ? "none" : "model", notice: muted ? quiet.notice : "muted", alert: "action" } };
  }
  if (recorded) return null;
  if (ctx.standing === "trusted") return { category: "model_spam", draft: quiet };
  const step = ladderStep(ctx.strictness, after(ctx.offences, false));
  return { category: "model_spam", draft: { actions: [...del, step], offence: "model", notice: noticeFor(step), alert: "action" } };
}

/** Observe mode acts only on protective deletes (secrets fully); the rest is reported. */
function observeOnly(d: ModDecision): ModDecision {
  if (d.category === "secret" || d.category === "secret_probable") return d;
  const actions = PROTECTIVE.has(d.category) ? d.actions.filter((a) => a.kind === "delete") : [];
  const alert: AlertKind = d.alert !== null && NEEDS_PERSON.has(d.alert) ? d.alert : "observe";
  return { ...d, actions, offence: "none", notice: actions.length > 0 ? "removed" : null, alert, observeOnly: true };
}

/**
 * Someone posting as a channel: delete; ban that channel identity for a
 * scam, but not for a link raid's copy, which is only deleted, as a
 * member's. No offence, and no notice mentions anyone.
 */
function asSenderChat(d: ModDecision): ModDecision {
  if (d.actions.length === 0) return { ...d, offence: "none" };
  const ban: ModAction[] = SCAMS.has(d.category) && d.category !== "link_raid" ? [{ kind: "ban_sender_chat" }] : [];
  return { ...d, actions: [DEL, ...ban], offence: "none" };
}

/**
 * Never punished: the deletes stand, and nothing else that bites; a
 * sanction's notice becomes the removal's, and an action alert with nothing
 * left to report goes (the crisis alert already names the person).
 */
function spared(d: ModDecision): ModDecision {
  const actions = d.actions.filter((a) => a.kind === "delete");
  const notice = d.notice !== null && SANCTIONS.has(d.notice) ? (actions.length > 0 ? "removed" : null) : d.notice;
  const alert = actions.length === 0 && d.alert === "action" ? null : d.alert;
  return { ...d, actions, offence: "none", notice, alert };
}

function stale(hits: readonly RuleHit[], ctx: DecideContext): ModDecision | null {
  const first = lead(hits.filter((h) => h.certain && (ctx.strictness !== "observe" || PROTECTIVE.has(h.category))));
  if (!first) return null;
  return { actions: [DEL], category: first.category, source: "rule", offence: "none", notice: null, alert: null, observeOnly: ctx.strictness === "observe", aiGuess: null };
}

/**
 * The decision for a message. With no verdict it is the rules' own, applied
 * at once; with Haiku's verdict it is only what the verdict adds to the
 * rules' decision on the same hits (already applied), or null. Admins are
 * never moderated; stale messages get deletes for certain hits only, and no
 * AI.
 */
export function decide(hits: readonly RuleHit[], verdict: TriageVerdict | null, ctx: DecideContext): ModDecision | null {
  if (ctx.standing === "admin") return null;
  if (ctx.stale) return verdict ? null : stale(hits, ctx);
  let d: ModDecision | null = null;
  if (verdict) {
    const v = byVerdict(hits, verdict, ctx);
    if (v) d = { ...v.draft, category: v.category, source: "model", observeOnly: false, aiGuess: verdict.reason || null };
  } else {
    const first = lead(hits);
    const draft = first ? byRule(first, ctx) : null;
    if (first && draft) d = { ...draft, category: first.category, source: "rule", observeOnly: false, aiGuess: null };
  }
  if (!d) return null;
  if (ctx.senderChat) d = asSenderChat(d);
  if (ctx.spare === true) d = spared(d);
  if (ctx.strictness === "observe") d = observeOnly(d);
  if (ctx.raid && d.notice !== null && SUMMED.has(d.notice)) d = { ...d, notice: null };
  const idle = d.actions.length === 0 && d.offence === "none" && d.notice === null && d.alert === null;
  return idle ? null : d;
}

/**
 * A message from another bot that isn't the group's admin nor in
 * TELEGRAM_ALLOWED_BOTS: the certain rules alone (a secret, a look-alike or
 * drainer link, an invite link, a risky file). A hit deletes the message and
 * bans the bot (no notice; the alert offers Unban); observe mode keeps only
 * protective deletes, and after downtime only certain hits are deleted.
 */
export function decideBot(hits: readonly RuleHit[], ctx: DecideContext): ModDecision | null {
  const own = hits.filter((h) => BOT_RULES.has(h.category));
  if (ctx.stale) return stale(own, ctx);
  const first = lead(own);
  if (!first) return null;
  const d: ModDecision = { actions: [DEL, { kind: "ban" }], category: first.category, source: "rule", offence: "none", notice: null, alert: "action", observeOnly: false, aiGuess: null };
  return ctx.strictness === "observe" ? observeOnly(d) : d;
}
