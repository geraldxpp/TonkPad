import type { AnsweredMap } from "../agent/answered";
import type { Proactive } from "../agent/proactive";
import { detectTrigger, type Me, type Trigger } from "../agent/triggers";
import type { EditMemory } from "../mod/edits";
import type { TgMessage } from "../types";
import type { Members } from "./members";
import type { Routed } from "./pipeline-commands";
import type { Moderated, Moderation } from "./pipeline-mod";
import { createStaleSummary } from "./pipeline-stale";
import type { AnswerHook, TriageJob } from "./pipeline-triage";
import type { Who } from "./pipeline-who";
import type { CommunityOut } from "./out";
import type { Qa } from "./qa";
import type { AlertSink, ChatId, RuleCategory, RuleHit } from "./types";
import type { CommunityDictionary } from "./words";

/**
 * Every message in a community group and the admin chat
 * (prompts/15-community-agent.md, Moderation and Where it answers). The
 * admin chat's go only to the controls. In a group: channel copies and the
 * bot's own messages are skipped; joins and leaves go to the member
 * handling; another bot's message is read by the certain rules alone; a
 * message (or an edit) that came while the worker was down gets the certain
 * rules' deletes and nothing else; any other is read for who wrote it, run
 * through the rules, the flood and raid watch and the rules' decision, then,
 * if it still stands, its command or its question for the bot, and Haiku's
 * check where the rules can't settle it. A question for the bot is answered
 * once the check lets it stand, with what the check found; one removed only
 * as a scam report, so its link doesn't spread ("@TonkfunBot is <look-alike>
 * real?"), is answered at once, replying to nothing. Someone at risk
 * gets the crisis reply, and is never punished. Secrets and flaw reports
 * never reach the model. Nothing here waits on the model, and nothing
 * throws into the update loop.
 */

export interface PipelineDeps {
  out: CommunityOut;
  alerts: AlertSink;
  adminChat: ChatId | null;
  owns: (chat: ChatId) => boolean;
  me: () => Me | null;
  who: { of(m: TgMessage, now: number): Promise<Who | null>; prune(now: number): void };
  moderation: Moderation;
  commands: { group(m: TgMessage): Promise<Routed>; adminChat(m: TgMessage, stale: boolean): Promise<"handled" | "pass">; prune(now: number): void };
  triage: { check(job: TriageJob): void; crisis(m: TgMessage, who: Who): void; tick(now: number): void; prune(now: number): void };
  qa: Qa;
  members: Pick<Members, "onServiceJoin" | "onServiceLeft">;
  proactive: Proactive;
  answered: AnsweredMap;
  edits: EditMemory;
  /** Every language's answer label, and the footer answers carried until 26 Nov 2026: a reply to one of the bot's answers is known by its label. */
  labels: ReadonlySet<string>;
  /** The admins' words, for the summary of what was removed while the worker was down. */
  adminWords: CommunityDictionary;
  now: () => number;
  log: (line: string) => void;
}

/** Never sent to the model, nor answered: secrets, flaw reports and the contact details removed for privacy. */
const NO_AI: ReadonlySet<RuleCategory> = new Set<RuleCategory>(["secret", "secret_probable", "security_report", "contact_info"]);
/** An edit Telegram held back while the worker was down: made over 5 minutes ago (router.ts STALE_SECONDS). */
const staleEdit = (m: TgMessage, now: number) => typeof m.edit_date === "number" && Math.floor(now / 1000) - m.edit_date > 300;
/** Removed as a scam report, so its link or handle doesn't spread (rules#1: a protective delete, no offence): every rule hit on it is one. */
const removedAsReport = (moderated: Moderated | null, hits: readonly RuleHit[]): boolean =>
  moderated !== null && moderated.removed && hits.length > 0 && hits.every((h) => h.category === "scam_report");

export function createPipeline(deps: PipelineDeps): {
  onMessage(m: TgMessage, stale: boolean): Promise<"handled" | "pass">;
  onEdited(m: TgMessage): Promise<void>;
  tick(now: number): Promise<void>;
} {
  const stale = createStaleSummary(deps.alerts, deps.adminWords);
  const noteStale = stale.note;
  const isOwn = (m: TgMessage) => {
    const me = deps.me();
    return me !== null && m.from?.id === me.id;
  };

  /** A question for the bot (a mention, /ask, a reply to its answer or card), or null. */
  function triggerOf(m: TgMessage): Trigger | null {
    const me = deps.me();
    return me ? detectTrigger(m, me, deps.labels) : null;
  }

  async function fresh(m: TgMessage, who: Who, now: number): Promise<"handled" | "pass"> {
    deps.proactive.noteMessage(m, who.standing, now);
    const result = deps.moderation.check(m, who, now);
    deps.edits.remember(m.chat.id, m.message_id, result.markers.linkKeys, now);
    const moderated = who.standing === "admin" ? null : deps.moderation.fresh(m, who, result, now);
    // A person at risk: the crisis reply and an urgent alert, never a punishment; their links still go to the check.
    const atRisk = result.markers.crisis === "strong";
    if (atRisk) deps.triage.crisis(m, who);
    // A scam report removed so its link doesn't spread still has its command routed and its question answered (rules#1).
    const report = removedAsReport(moderated, result.hits);
    let routed: Routed = "none";
    let answer: AnswerHook | null = null;
    if (!atRisk && (!moderated?.removed || report) && !result.hits.some((h) => NO_AI.has(h.category))) {
      routed = await deps.commands.group(m);
      const t = routed === "none" || routed === "ask" ? triggerOf(m) : null;
      // Someone posting as a chat is never answered (qa skips them): their question is only checked.
      if (t && who.user !== null) answer = { run: (checked) => void deps.qa.onTrigger(m, t, checked, report), busy: () => void deps.qa.onBusy(m, t) };
    }
    const checks = moderated !== null && (routed === "none" || routed === "ask");
    // A scam report never goes to the check (mod/triage.ts SETTLED): its question is answered at once, replying to nothing.
    if (checks) deps.triage.check({ ...moderated, m, who, result, answer: report ? null : answer });
    if (!checks || report) answer?.run(null);
    return routed === "pass" ? "pass" : "handled";
  }

  return {
    async onMessage(m, stale) {
      try {
        const chat = m?.chat?.id;
        if (typeof chat !== "number") return "pass";
        if (chat === deps.adminChat) return await deps.commands.adminChat(m, stale);
        if (!deps.owns(chat)) return "pass";
        if (m.is_automatic_forward === true || isOwn(m)) return "handled";
        if (Array.isArray(m.new_chat_members)) {
          void deps.members.onServiceJoin(m);
          return "handled";
        }
        const now = deps.now();
        if (m.left_chat_member) {
          const user = m.left_chat_member.id;
          if (Number.isSafeInteger(user) && user > 0) deps.moderation.left(chat, user, now);
          deps.members.onServiceLeft(m);
          return "handled";
        }
        const who = await deps.who.of(m, now);
        if (!who) return "pass";
        if (who.bot === true) {
          if (who.standing !== "admin" && deps.moderation.bot(m, who, now, stale) && stale) noteStale(chat, now);
          return "handled";
        }
        if (!stale) return await fresh(m, who, now);
        if (who.standing !== "admin" && deps.moderation.stale(m, who, now)) noteStale(chat, now);
        return "handled";
      } catch {
        deps.log("a community message wasn't handled");
        return "handled";
      }
    },

    async onEdited(m) {
      try {
        const chat = m?.chat?.id;
        if (typeof chat !== "number" || !deps.owns(chat) || m.is_automatic_forward === true || isOwn(m)) return;
        const now = deps.now();
        // An answered question that changed takes its answer down: the edit could turn the question around.
        const answer = deps.answered.answerOf(chat, m.message_id, now);
        if (answer !== null) {
          deps.out.remove(chat, [answer]);
          deps.answered.forget(chat, m.message_id);
        }
        const who = await deps.who.of(m, now);
        if (!who) return;
        const late = staleEdit(m, now);
        if (who.bot === true) {
          if (who.standing !== "admin" && deps.moderation.bot(m, who, now, late) && late) noteStale(chat, now);
          return;
        }
        // An edit drops its own unprompted candidate.
        deps.proactive.noteMessage(m, who.standing, now);
        if (who.standing === "admin") return;
        // Made while the worker was down: the certain rules' deletes only, as for a message from then.
        if (late) {
          if (deps.moderation.stale(m, who, now)) noteStale(chat, now);
          return;
        }
        const { result, moderated } = deps.moderation.edited(m, who, now);
        if (result.markers.crisis === "strong") deps.triage.crisis(m, who);
        deps.triage.check({ ...moderated, m, who, result, answer: null });
      } catch {
        deps.log("a community edit wasn't handled");
      }
    },

    async tick(now) {
      try {
        for (const c of deps.proactive.due(now, (candidate) => deps.qa.allowProactive(candidate, now))) void deps.qa.onProactive(c);
        stale.summary(now);
        deps.triage.tick(now);
        deps.who.prune(now);
        deps.triage.prune(now);
        deps.commands.prune(now);
      } catch {
        deps.log("the pipeline's tick failed");
      }
    },
  };
}
