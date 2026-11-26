import type { Locale } from "@/shared/i18n/config";
import type { JobQueue } from "../agent/jobs";
import type { Proactive } from "../agent/proactive";
import type { Me } from "../agent/triggers";
import type { AiLimits, Budget, ClaudeClient } from "../claude/types";
import { userCode } from "../claude/user-code";
import type { ModDeps } from "../mod/actions";
import type { RaidWatch } from "../mod/raid";
import { shouldTriage, triageMessage } from "../mod/triage";
import type { TgMessage } from "../types";
import type { CommunityOut } from "./out";
import { createCrisisGate } from "./pipeline-crisis";
import type { Moderated } from "./pipeline-mod";
import { triageInput } from "./pipeline-triage-input";
import { createWaiting, waitKey } from "./pipeline-triage-later";
import { createCheckPace, printOf } from "./pipeline-triage-pace";
import { createVerdicts } from "./pipeline-triage-verdict";
import type { Who } from "./pipeline-who";
import type { Checked } from "./qa-reply";
import type { AlertSink, AllowList, ChatId, OfficialAccounts, Records, RuleResult } from "./types";
import type { CommunityDictionary } from "./words";

/**
 * Haiku's check in the pipeline (prompts/15-community-agent.md, Haiku's
 * check): which messages go, the job that sends one, and what its verdict
 * adds to the rules' decision (pipeline-triage-verdict.ts). A check past
 * its member's 3 a minute waits for their turn within its 60 seconds, and
 * an edit within a minute of its message's last check waits for that
 * minute to end (pipeline-triage-later.ts): one check per message a minute,
 * none dropped. It fails closed: no check (no budget, AI off, the group's
 * 30 a minute used, a full queue, a turn that never came, a check dropped
 * past its minute) or no verdict (a refusal, a timeout, an error) leaves the
 * rules' decision standing, and holds a link relaxed mode kept up, or a new
 * member's link, handle or address. A question to the bot is checked like
 * any message, and answered once its verdict lets it stand; without one,
 * only when it carries no link, handle or address. Someone at risk gets the
 * crisis reply through pipeline-crisis.ts's pacing.
 */

export interface TriageDeps {
  /** Null when no model call can run. */
  client: ClaudeClient | null;
  budget: Budget | null;
  limits: AiLimits;
  /** The checks' queue: 4 at once, 200 waiting. */
  checks: JobQueue;
  official: OfficialAccounts;
  allow: AllowList;
  userCodeKey: string | null;
  records: Records;
  out: CommunityOut;
  alerts: AlertSink;
  mod: ModDeps;
  raid: Pick<RaidWatch, "noteAction">;
  /** The public crisis reply and its urgent alert (qa.crisis), paced per group here. */
  crisis: (m: TgMessage) => Promise<void>;
  /** The crisis reply to the poster alone (an ephemeral message), best effort; without it a reply past the group's pace is skipped. */
  crisisCopy?: (m: TgMessage) => void;
  proactive: Proactive;
  me: () => Me | null;
  words: (lang: Locale) => CommunityDictionary;
  site: string;
  /** The DM warning: true at most once per 30 minutes per chat, shared with the answers. */
  dmWarning: (chat: ChatId, now: number) => boolean;
  now: () => number;
  log: (line: string) => void;
}

/** A question to the bot, waiting on its check. */
export interface AnswerHook {
  /** Answers it once its message stands: with what the check found, or null when none ran. */
  run(checked: Checked | null): void;
  /** The busy note instead: no check could run, and the message carries a link, a handle or an address. */
  busy(): void;
}

/** One message for Haiku's check: what the rules found and did with it. */
export interface TriageJob extends Moderated {
  m: TgMessage;
  who: Who;
  result: RuleResult;
  /** A question to the bot (a mention, /ask, a reply to its answer or card), or null. */
  answer: AnswerHook | null;
}

/** A check that hasn't started within a minute of its message is dropped (and the text it holds). */
const CHECK_WAIT_MS = 60_000;

export function createTriage(deps: TriageDeps): {
  check(job: TriageJob): void;
  /** Someone at risk: the crisis reply and the urgent alert, paced per group. */
  crisis(m: TgMessage, who: Who): void;
  /** Runs the checks whose turn came, and the crisis replies' summaries. */
  tick(now: number): void;
  prune(now: number): void;
} {
  const pace = createCheckPace();
  const waiting = createWaiting();
  const gate = createCrisisGate({
    reply: deps.crisis, copy: deps.crisisCopy, alerts: deps.alerts, records: deps.records, now: deps.now,
    adminWords: () => deps.mod.words(deps.mod.adminLang ?? "en"),
  });
  // A message the rules or a verdict removed has no check left waiting.
  const verdicts = createVerdicts(deps, gate, (chat, messageId) => waiting.drop(waitKey(chat, messageId)));

  /** Queues the check, or waits for the member's turn by `deadline`, or falls back to the rules. */
  function go(job: TriageJob, print: string, now: number, deadline: number): void {
    const { m, who } = job;
    const chat = job.target.chat;
    const author = who.user ?? who.senderChat;
    const { client, budget } = deps;
    if (!client || !budget || !budget.available("triage", now)) return verdicts.fallBack(job);
    // The member's 3 a minute first, so one member can't spend the group's 30: past them the check waits for a turn.
    if (author !== null && !pace.room(chat, author, now)) {
      const at = pace.free(chat, author, now);
      if (at > deadline || !waiting.put(waitKey(chat, m.message_id), { job, print, at, deadline, kind: "turn" })) verdicts.fallBack(job);
      return;
    }
    if (!deps.limits.triage(chat, now)) return verdicts.fallBack(job);
    const input = triageInput(job, deps.me());
    const code = deps.userCodeKey !== null && who.user !== null ? userCode(deps.userCodeKey, who.user, now) : null;
    const triage = { client, budget, official: deps.official, allow: deps.allow, now: deps.now };
    // Keyed by message, so one group's checks run side by side; a check dropped past its minute falls back like a failed one.
    const queued = deps.checks.push(
      waitKey(chat, m.message_id),
      deadline,
      async () => {
        try {
          await verdicts.onVerdict(job, await triageMessage(input, triage, code));
        } catch {
          deps.log("a check's verdict wasn't applied");
        }
      },
      () => verdicts.fallBack(job),
    );
    if (!queued) return verdicts.fallBack(job);
    pace.use(chat, author, m.message_id, now);
  }

  function check(job: TriageJob): void {
    const { m, who, result, ctx } = job;
    // Admins are never checked; their questions are answered at once.
    if (who.standing === "admin") return void job.answer?.run(null);
    const now = deps.now();
    const chat = job.target.chat;
    const key = waitKey(chat, m.message_id);
    const print = printOf(m, result);
    const seen = pace.seen(chat, m.message_id, print, m.edit_date !== undefined, now);
    // An edit that changed nothing the check reads keeps the verdict it had, and drops a waiting check of another version.
    if (seen === "same") {
      if (waiting.get(key)?.print !== print) waiting.drop(key);
      return;
    }
    waiting.drop(key);
    if (!shouldTriage(result, who.standing, { raid: ctx.raid, removedLink: job.removedLink })) return void job.answer?.run(null);
    if (seen !== "soon") return go(job, print, now, now + CHECK_WAIT_MS);
    // Within a minute of the message's last check: this version is checked when the minute ends, unless the rules removed it.
    const at = pace.due(chat, m.message_id, now) ?? now;
    if (job.removed || !waiting.put(key, { job, print, at, deadline: at + CHECK_WAIT_MS, kind: "edit" })) verdicts.fallBack(job);
  }

  return {
    check(job) {
      try {
        check(job);
      } catch {
        deps.log("a check wasn't queued");
      }
    },

    crisis: (m, who) => gate.crisis(m, who),

    tick(now) {
      gate.tick(now);
      for (const w of waiting.take(now)) {
        try {
          // The tick that runs a turn may come up to 5 seconds after it: the check may still start then.
          if (w.kind === "edit") check(w.job);
          else go(w.job, w.print, now, Math.max(w.deadline, now));
        } catch {
          deps.log("a waiting check wasn't run");
        }
      }
    },

    prune(now) {
      verdicts.prune(now);
      pace.prune(now);
      gate.prune(now);
    },
  };
}
