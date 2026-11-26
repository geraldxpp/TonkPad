import type { CallKind, Lane } from "./types";

/** How the day's cap is split between the lanes (prompts/15-community-agent.md, The daily cap and its lanes; claude/budget.ts). */

export const ANSWER_LANES = ["group", "proactive", "private"] as const;
export type AnswerLane = (typeof ANSWER_LANES)[number];
export const isAnswerLane = (lane: Lane): lane is AnswerLane => lane !== "triage";
/** Each kind of call has its own breaker (claude/budget-breaker.ts): checks in the triage lane, answers in the rest. */
export const kindOf = (lane: Lane): CallKind => (lane === "triage" ? "triage" : "answer");

/** Shares of the cap. A share of 1 or more (or a keep of 0) is no gate of its own: only the day's cap stops there. */
export interface BudgetSplit {
  /** Each answer lane's share of the cap. */
  shares: Readonly<Record<AnswerLane, number>>;
  /** Kept for moderation checks: the answer lanes together stop at the rest, and checks may use whatever is left. */
  triageKeep: number;
  /** Past this share of the day, private and unprompted answers stop. */
  late: number;
}

/** Each answer lane's share of the day's cap (TELEGRAM_AI_BUDGET_USD). */
export const LANE_SHARES: Readonly<Record<AnswerLane, number>> = Object.freeze({ group: 0.45, proactive: 0.15, private: 0.3 });
/** Kept for moderation checks: the answer lanes together stop at the rest (90%), and checks may use whatever is left. */
export const TRIAGE_KEEP = 0.1;

/**
 * The bot's split: group answers 45%, unprompted 15% and private 30%, checks
 * keep 10%, private and unprompted answers stop at 80% of the day. Checks
 * run on Haiku 5.5 and cost a small part of an answer on Sonnet or Opus, so
 * answers get most of the day.
 */
export const BOT_SPLIT: BudgetSplit = Object.freeze({ shares: LANE_SHARES, triageKeep: TRIAGE_KEEP, late: 0.8 });

/**
 * One cap that every lane shares, with no lane, 80% or checks' share
 * stopping anything before it: the offline eval's (evals/agent/run.ts),
 * whose sections each run on whatever the ones before them left. Never the
 * bot's: its split keeps questions from using up moderation's money.
 */
export const ONE_CAP: BudgetSplit = Object.freeze({ shares: Object.freeze({ group: 1, proactive: 1, private: 1 }), triageKeep: 0, late: 1 });
