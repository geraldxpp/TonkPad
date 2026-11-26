import { describe, expect, it } from "vitest";
import { HELP } from "../evals/agent/run-args";
import { CAPS_USD, evalBudget } from "../evals/agent/run-budget";
import { createBudget } from "../src/telegram/claude/budget";
import { TOOL_PROMPT_TOKENS, worstCaseUsd } from "../src/telegram/claude/prices";
import type { Budget, Lane } from "../src/telegram/claude/types";
import { costing, HAIKU } from "./claude-budget-fixtures";

/**
 * The offline eval's budget (worker/evals/agent/run-budget.ts): one cap for
 * the run, by the answers' model, that every section shares, so the --effort
 * and --lang passes run in full. No model, no network: requests are reserved
 * and charged by hand.
 */

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
/** Haiku 5.5's cap: the run these sections model. */
const CAP = CAPS_USD["claude-haiku-5-5"];
/** One answer's worst case on Haiku 5.5 with the real request (some 53,000 characters, 8,000 output tokens, the tool prompt), and about its real cost. */
const WORST = worstCaseUsd(53_000, 8_000, HAIKU, TOOL_PROMPT_TOKENS);
const COST = 0.006;

/** One section of `n` answers in a lane, one at a time: each reserves its worst case and is charged its cost. How many ran. */
function section(budget: Budget, lane: Lane, n: number): number {
  let ran = 0;
  for (let i = 0; i < n; i += 1) {
    const ticket = budget.reserve(lane, WORST, T0, HAIKU);
    if (!ticket) break;
    budget.commit(ticket, costing(COST), null, T0);
    ran += 1;
  }
  return ran;
}

describe("the eval's budget (K12)", () => {
  it("caps a run by its answers' model: $1 on Haiku 5.5, $5 on Sonnet 5.5, $10 on Opus 5.5", () => {
    expect(CAPS_USD).toEqual({ "claude-haiku-5-5": 1, "claude-sonnet-5-5": 5, "claude-opus-5-5": 10 });
    expect(evalBudget(() => undefined, CAPS_USD["claude-sonnet-5-5"], () => T0).status(T0).capUsd).toBe(5);
  });

  it("would stop with the bot's own split: its group lane stops at 45% of the cap, during the second pass", () => {
    const bot = createBudget({ capUsd: CAP, saved: null, off: null, save: () => undefined, saveOff: () => undefined, onEvent: () => undefined, now: () => T0 });
    expect([section(bot, "group", 40), section(bot, "group", 40), section(bot, "group", 40)]).toEqual([40, 34, 0]);
  });

  it("lets the English, --effort and --lang passes run in full on one shared cap, with no lane or 80% alert", () => {
    const lines: string[] = [];
    const budget = evalBudget((line) => void lines.push(line), CAP, () => T0);
    expect([section(budget, "group", 40), section(budget, "group", 40), section(budget, "private", 40)]).toEqual([40, 40, 40]);
    expect(section(budget, "proactive", 12)).toBe(12);
    expect(budget.reserve("triage", 0.001, T0, HAIKU)).not.toBeNull();
    expect(budget.status(T0).spentUsd).toBeCloseTo(132 * COST, 9);
    expect(lines).toEqual([]);
  });

  it("still stops the whole run at its cap, and says so once its spending reaches it", () => {
    const lines: string[] = [];
    const budget = evalBudget((line) => void lines.push(line), CAP, () => T0);
    // Answers run until the cap has no room for one more worst case: refused, never past the cap (model#1).
    const ran = section(budget, "group", 1_000);
    expect(ran).toBe(166);
    expect(budget.status(T0).spentUsd).toBeLessThanOrEqual(CAP);
    expect(lines).toEqual([]);
    // What still fits runs, and the cap closes, said once, when the spending reaches it.
    const last = budget.reserve("triage", 0.004, T0, HAIKU);
    expect(last).not.toBeNull();
    budget.commit(last!, costing(0.004), null, T0);
    expect(budget.status(T0)).toMatchObject({ on: false, reason: "cap" });
    expect(budget.reserve("triage", 0.001, T0, HAIKU)).toBeNull();
    expect(lines).toEqual(["(budget: cap)"]);
  });

  it("says so in --help, with each model's cap", () => {
    const help = HELP.replace(/\s+/g, " ");
    expect(help).toContain("Every section shares that one cap, without the bot's lanes (which would stop group answers at 45% of it)");
    expect(help).toContain("--effort and --lang passes run on");
    for (const usd of ["$1.00", "$5.00", "$10.00"]) expect(HELP).toContain(usd);
  });
});
