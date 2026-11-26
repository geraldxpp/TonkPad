import { ANSWER_SETTINGS } from "../../src/telegram/agent/answer-request";
import { PRICES } from "../../src/telegram/claude/prices";
import { type AnswerModel, LANES } from "../../src/telegram/claude/types";
import type { AnswerCase, ModerationCase } from "./grade";
import type { EvalArgs } from "./run-args";
import { type AnswerRun, type EvalEnv, type ModerationRun, runAnswer, runModeration } from "./run-cases";
import { type CallRecord, type Effort, pool } from "./run-meter";
import { dollars, printAnswer, printSummary, printTable, printUsage, printVerdict, type SectionStats } from "./run-print";

/**
 * The eval's sections, in order (run.ts): the answer cases in English at
 * their model's effort, the unprompted candidates, the moderation messages,
 * then the answer cases again at --effort and in --lang. Each section runs
 * its first case alone (so the prompt cache is written once), then 4 at a
 * time, as the bot's own queues do; every case prints as it finishes, and
 * the tables and totals follow at the end.
 */

export interface Plan {
  answers: AnswerCase[];
  proactive: AnswerCase[];
  moderation: ModerationCase[];
  /** The answer cases in --lang. */
  translated: AnswerCase[];
  /** Answer cases with no question in --lang, left out of that section. */
  untranslated: number;
}

const CONCURRENCY = 4;
/**
 * The brief's typical answer, priced on its model's card for the printed
 * estimate: about 1.4 requests, each reading some 17,500 cached tokens and
 * sending 1,300 new ones, with up to half its max_tokens out (thinking
 * included); a cold 1-hour cache write of its prefix is as many tokens.
 */
const ANSWER = { requests: 1.4, read: 17_500, input: 1_300 } as const;
/** A check on Haiku 5.5, whatever answers run on, and a cold write of its own prefix. */
const PER_CHECK = 0.0003;
const CHECK_PREFIX = 0.005;

/** One answer on `model`, and one cold write of its prefix, in dollars. */
export function answerUsd(model: AnswerModel): { answer: number; prefix: number } {
  const c = PRICES[model].card;
  const out = ANSWER_SETTINGS[model].maxTokens / 2;
  return { answer: (ANSWER.requests * (ANSWER.read * c.read + ANSWER.input * c.input + out * c.output)) / 1e6, prefix: (ANSWER.read * c.write1h) / 1e6 };
}

/** What the plan would cost, roughly: answers on its model, checks, and the cache writes of each prefix it uses (an --effort or --lang pass writes another). */
export function estimateUsd(plan: Plan, args: EvalArgs): number {
  const { answer, prefix } = answerUsd(args.model);
  const answers = plan.answers.length * (args.effort ? 2 : 1) + plan.translated.length + plan.proactive.length;
  const checks = plan.proactive.length + plan.moderation.length;
  const prefixes = answers > 0 ? 1 + (args.effort ? 1 : 0) + (args.lang ? 1 : 0) : 0;
  return answers * answer + checks * PER_CHECK + prefixes * prefix + (checks > 0 ? CHECK_PREFIX : 0);
}

const answerStats = (title: string, runs: readonly AnswerRun[]): SectionStats => {
  const called = runs.filter((r) => r.result.kind !== "unavailable");
  return {
    title,
    grades: runs.map((r) => r.grade),
    times: called.map((r) => r.ms),
    calls: runs.flatMap((r) => r.calls),
    blocked: runs.filter((r) => r.gated?.blocked).length,
    answers: called.length,
  };
};

const moderationStats = (title: string, runs: readonly ModerationRun[]): SectionStats => {
  const called = runs.filter((r) => r.calls.length > 0);
  return { title, grades: runs.map((r) => r.grade), times: called.map((r) => r.ms), calls: runs.flatMap((r) => r.calls), blocked: 0, answers: called.length };
};

/** Why calls failed, in words the owner can act on, once each. */
function failureHints(calls: readonly CallRecord[]): string[] {
  const kinds = new Set(calls.flatMap((c) => (c.failure ? [c.failure] : [])));
  const hints: string[] = [];
  if (kinds.has("auth")) hints.push("Anthropic refused the key (authentication or permission): check ANTHROPIC_API_KEY and its workspace.");
  if (kinds.has("billing")) hints.push("Anthropic refused for billing: top up the credits or raise the workspace's limit.");
  if (kinds.has("not_found")) hints.push("Anthropic couldn't find the model or the key's workspace.");
  if (kinds.has("rate_limited") || kinds.has("ramp")) hints.push("Some calls hit Anthropic's rate limits: run again later, or with --only.");
  if (kinds.has("timeout") || kinds.has("network")) hints.push("Some calls timed out or lost the network.");
  return hints;
}

/** Runs every section and prints the results; true when any case failed. */
export async function runSections(plan: Plan, args: EvalArgs, env: EvalEnv, capUsd: number): Promise<boolean> {
  const sections: SectionStats[] = [];
  /** The answers' own effort, as their model runs them. */
  const base = ANSWER_SETTINGS[env.model].effort;
  const answers = async (title: string, cases: readonly AnswerCase[], effort: Effort | null) => {
    if (cases.length === 0) return;
    console.log(`\n=== ${title} ===\n`);
    const runs = await pool(cases, CONCURRENCY, async (c) => {
      const run = await runAnswer(c, env, effort);
      printAnswer(run);
      return run;
    });
    sections.push(answerStats(title, runs));
  };

  console.log("\nEach answer prints its question, what the model returned and what members would see (Shown), without the pipeline's own extra lines such as the DM warning or \"I've let the team know\". Failures follow each case, then the tables and totals.");
  await answers(`Answers, effort ${base}`, plan.answers, null);
  await answers(`Unprompted candidates, effort ${base}`, plan.proactive, null);
  if (plan.moderation.length > 0) {
    console.log("\n=== Moderation checks, effort low, no thinking ===\n");
    const runs = await pool(plan.moderation, CONCURRENCY, async (c) => {
      const run = await runModeration(c, env);
      printVerdict(run);
      return run;
    });
    sections.push(moderationStats("Moderation checks", runs));
  }
  if (args.effort) await answers(`Answers, effort ${args.effort}`, plan.answers, args.effort);
  if (args.lang) {
    if (plan.untranslated > 0) console.log(`\n(${plan.untranslated} answer cases have no ${args.lang} question and are left out of the ${args.lang} run.)`);
    await answers(`Answers in ${args.lang}, effort ${base}`, plan.translated, null);
  }

  for (const s of sections) printTable(s.title, s.grades);
  printSummary(sections);
  const calls = sections.flatMap((s) => s.calls);
  printUsage(calls);
  const at = Date.now();
  const status = env.budget.status(at);
  const lanes = LANES.map((lane) => `${lane} ${dollars(status.lanes[lane].spentUsd)}`).join(", ");
  console.log(`The budget charged ${dollars(status.spentUsd)} of its ${dollars(capUsd)} (${lanes}), timeouts' reservations included.`);
  // Checks and answers pause apart (claude/budget-breaker.ts): say which had stopped.
  const stopped = ([["checks", "triage"], ["answers", "group"]] as const).filter(([, lane]) => !env.budget.available(lane, at)).map(([name]) => name);
  if (!status.on) console.log(`AI was off at the end (${status.reason ?? "unknown"}): ${stopped.length > 0 ? stopped.join(" and ") : "some calls"} after that point weren't sent.`);
  for (const hint of failureHints(calls)) console.log(hint);
  return sections.some((s) => s.grades.some((g) => !g.pass));
}
