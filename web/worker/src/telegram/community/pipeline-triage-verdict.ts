import { isLocale, type Locale } from "@/shared/i18n/config";
import { visibleText } from "../../text";
import { hideMarked, markedContacts } from "../agent/mask";
import { repliedTo, topicOf } from "../agent/triggers";
import { applyDecision, decide } from "../mod/actions";
import { escapeHtml as esc } from "../text";
import { createOnce } from "./hold";
import type { CrisisGate } from "./pipeline-crisis";
import { textOf } from "./pipeline-mod-input";
import type { TriageDeps, TriageJob } from "./pipeline-triage";
import { heldDecision } from "./pipeline-triage-hold";
import { escalationView } from "./pipeline-triage-reply";
import type { Who } from "./pipeline-who";
import type { Checked } from "./qa-reply";
import type { ChatId, Escalation, TriageVerdict } from "./types";

/**
 * What Haiku's verdict adds to the rules' decision on the same hits
 * (prompts/15-community-agent.md, Haiku's check: How it's used), and what
 * happens without one. Someone at risk is never punished: a scam or spam
 * verdict still deletes, then the crisis reply goes out. A question to the
 * bot is answered only once its message stands, with what the check found:
 * a DM scam it read (the answer then carries the fixed warning) and the
 * case's alert, which the answer path sends unless the answer escalates
 * the case itself (one alert per message). Without a verdict, it is
 * answered only when it carries no link, handle or address, else the busy
 * note goes.
 */

/** An unprompted candidate is 15 to 600 characters. */
const MIN_CANDIDATE = 15;
const MAX_CANDIDATE = 600;
/** The reply to a case that needs a person, once per member and case per 10 minutes. */
const TEMPLATE_MS = 10 * 60_000;

/** A link, handle or address the rules left for the check (mod/rules-scan.ts linkKeys): never an allowed link, an official or admin's handle, or the pack's addresses. */
const carries = (job: TriageJob): boolean => job.result.markers.linkKeys.length > 0;

export function createVerdicts(deps: TriageDeps, gate: CrisisGate, gone: (chat: ChatId, messageId: number) => void) {
  const told = createOnce(TEMPLATE_MS);
  const langOf = (v: TriageVerdict, who: Who): Locale => (isLocale(v.language) ? v.language : who.lang);

  /**
   * A message the check can't read is held (deleted, no offence, the admins
   * told) when it carries what the rules left to the check: in relaxed mode
   * a member's unknown link, and a new member's link, handle or address.
   * Never in observe mode. True when it was.
   */
  function hold(job: TriageJob): boolean {
    const decision = heldDecision(job, deps.me());
    if (!decision) return false;
    void applyDecision(decision, job.target, deps.mod);
    deps.records.count(job.target.chat, "held", deps.now());
    gone(job.target.chat, job.m.message_id);
    return true;
  }

  /**
   * No verdict (no check, a full line, a failure, a turn that never came, a
   * check dropped late): the rules' decision stands, and a message the check
   * should have read is held. A question to the bot whose message stands is
   * answered only when it carries no link, handle or address; else it gets
   * the busy note.
   */
  function fallBack(job: TriageJob): void {
    if (hold(job) || !job.answer) return;
    if (carries(job)) job.answer.busy();
    else job.answer.run(null);
  }

  /** A clean question Haiku found about tonkfun.fun, new, from a member, not a reply to anyone else: offered for an unprompted answer. */
  function offer(job: TriageJob, v: TriageVerdict): void {
    const { m, who } = job;
    if (job.removed || job.hits.length > 0 || m.edit_date !== undefined || m.forward_origin || who.user === null || who.standing === "admin") return;
    if (v.verdict !== "ok" || v.question !== "tonkfun" || v.needs_human !== "none") return;
    const text = visibleText(textOf(m).text);
    const length = [...text].length;
    const replied = repliedTo(m);
    const me = deps.me();
    if (length < MIN_CANDIDATE || length > MAX_CANDIDATE || (replied !== null && (me === null || replied.from?.id !== me.id))) return;
    // What Telegram marked as a phone number or an e-mail address never waits for the model as written.
    deps.proactive.offer({ chat: m.chat.id, messageId: m.message_id, user: who.user, text: hideMarked(text, markedContacts(m)), lang: langOf(v, who), thread: topicOf(m), at: deps.now() });
  }

  /** The admins' alert for a case that needs a person, and the day's count. */
  function alertCase(job: TriageJob, kind: Escalation, v: TriageVerdict): void {
    const { m, who, target } = job;
    deps.alerts.alert({
      chat: target.chat, kind, category: kind, member: { id: who.user, name: who.name, username: who.username, since: target.since ?? null },
      excerpt: kind === "security" ? null : target.excerpt || null, link: target.link, done: null, aiGuess: v.reason || null,
      undo: null, messageId: m.message_id, routine: false, urgent: false,
    });
    deps.records.count(target.chat, "escalated", deps.now());
  }

  /** The case a verdict found, unless an "unsure" verdict already alerted through its decision. */
  const caseOf = (v: TriageVerdict): Escalation | null => (v.needs_human === "none" || (v.needs_human === "unsure" && v.verdict === "unsure") ? null : v.needs_human);

  /** A case that needs a person: the admins' alert, then the member's fixed reply when the message is new and still stands (not in observe mode). */
  async function escalate(job: TriageJob, kind: Escalation, v: TriageVerdict, stands: boolean, now: number): Promise<void> {
    const { m, who, target } = job;
    alertCase(job, kind, v);
    // Observe mode only reports: the member hears nothing in public.
    if (!stands || m.edit_date !== undefined || job.ctx.strictness === "observe") return;
    if (!told.first(`${target.chat}:${who.user ?? who.senderChat}:${kind}`, now)) return;
    const view = escalationView(kind, deps.words(langOf(v, who)), deps.site);
    if (view) await deps.out.send(target.chat, view.text, { kind: "notice", replyTo: m.message_id, thread: topicOf(m), keyboard: view.keyboard });
  }

  /** What a question to the bot carries from its check: the DM scam it read, and its case's alert, sent at most once. */
  function checkedOf(job: TriageJob, v: TriageVerdict): Checked {
    const kind = caseOf(v);
    let sent = false;
    const alert = kind === null ? null : () => {
      if (sent) return;
      sent = true;
      alertCase(job, kind, v);
    };
    return { dmScam: v.dm_scam_mention, needs: kind ?? "none", alert };
  }

  async function onVerdict(job: TriageJob, v: TriageVerdict | null): Promise<void> {
    if (v === null) return fallBack(job);
    const now = deps.now();
    const { m, who } = job;
    const atRisk = v.needs_human === "crisis" || job.result.markers.crisis === "strong";
    const d = decide(job.hits, v, atRisk ? { ...job.ctx, spare: true } : job.ctx);
    if (d) {
      void applyDecision(d, job.target, deps.mod);
      if (d.actions.length > 0) deps.raid.noteAction(job.target.chat, now);
    }
    const stands = !job.removed && !d?.actions.some((a) => a.kind === "delete");
    if (!stands) gone(job.target.chat, m.message_id);
    // At risk: the verdict's deletes stood (no offence, mute or ban); now the crisis reply, and nothing else.
    if (atRisk) return gate.crisis(m, who);
    const kind = caseOf(v);
    if (job.answer && stands) return job.answer.run(checkedOf(job, v));
    if (kind !== null) await escalate(job, kind, v, stands, now);
    if (job.answer) return;
    if (v.dm_scam_mention && stands && job.ctx.strictness !== "observe" && deps.dmWarning(m.chat.id, now)) {
      await deps.out.send(m.chat.id, esc(deps.words(langOf(v, who)).safety.dmWarning), { kind: "notice", replyTo: m.message_id, thread: topicOf(m) });
    }
    offer(job, v);
  }

  return { onVerdict, fallBack, prune: (now: number) => told.prune(now) };
}
