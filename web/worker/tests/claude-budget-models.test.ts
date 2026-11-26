import { describe, expect, it } from "vitest";
import { ANSWER_SETTINGS } from "../src/telegram/agent/answer-request";
import { createBudget } from "../src/telegram/claude/budget";
import { costOf, TOOL_PROMPT_TOKENS, worstCaseUsd } from "../src/telegram/claude/prices";
import { ANSWER_MODELS, type AnswerModel, type ClaudeModel, DEFAULT_ANSWER_MODEL, TRIAGE_MODEL, type Usage } from "../src/telegram/claude/types";
import { costing } from "./claude-budget-fixtures";

/**
 * The ledger charges each request at its own model's prices (claude/budget.ts,
 * claude/prices.ts): a ticket keeps the model it was reserved for, and its
 * commit prices the reply's usage on that model's card, whatever the other
 * requests in flight run on.
 */

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
const ledger = () => createBudget({ capUsd: 3, saved: null, off: null, save: () => undefined, saveOff: () => undefined, onEvent: () => undefined, now: () => T0 });
/** An answer's request as the API reports it: mostly cache reads, some new input, and the reply with its thinking. */
const REPLY: Usage = { ...costing(0), input_tokens: 1_300, cache_read_input_tokens: 17_500, output_tokens: 1_200 };
/** A check's: its cached prompt, the message and a short verdict. */
const VERDICT: Usage = { ...costing(0), input_tokens: 300, cache_read_input_tokens: 2_500, output_tokens: 90 };
/** One answer attempt's worst case with a request of the real size (some 51,500 characters) at its model's settings, the tool prompt included. */
const answerWorst = (model: AnswerModel) => worstCaseUsd(51_500, ANSWER_SETTINGS[model].maxTokens, model, TOOL_PROMPT_TOKENS);

describe("the ledger's prices", () => {
  it("charges each reply at the prices of the model its ticket was reserved for", () => {
    const charged: number[] = [];
    for (const model of ANSWER_MODELS) {
      const budget = ledger();
      const ticket = budget.reserve("group", 0.2, T0, model);
      expect(ticket).toMatchObject({ lane: "group", worstUsd: 0.2, model });
      charged.push(budget.commit(ticket!, REPLY, null, T0));
      expect(budget.status(T0).lanes.group.spentUsd).toBe(charged.at(-1));
    }
    // Sonnet 5.5: 1,300 × 2 + 17,500 × 0.10 + 1,200 × 10; Opus 5.5 twice that; Haiku 5.5: 1,300 × 0.10 + 17,500 × 0.01 + 1,200 × 0.50.
    expect(charged[0]).toBeCloseTo(16_350 / 1e6, 12);
    expect(charged[1]).toBeCloseTo(32_700 / 1e6, 12);
    expect(charged[2]).toBeCloseTo(905 / 1e6, 12);
  });

  it("charges answers on Sonnet 5.5 and checks on Haiku 5.5 side by side, each on its own card", () => {
    const budget = ledger();
    const answer = budget.reserve("group", answerWorst(DEFAULT_ANSWER_MODEL), T0, DEFAULT_ANSWER_MODEL)!;
    const check = budget.reserve("triage", worstCaseUsd(17_000, 400, TRIAGE_MODEL), T0, TRIAGE_MODEL)!;
    budget.commit(check, VERDICT, null, T0);
    budget.commit(answer, REPLY, null, T0);
    const { lanes } = budget.status(T0);
    // 300 × 0.10 + 2,500 × 0.01 + 90 × 0.50 = 100 millionths: a check is about a hundredth of a cent, beside an answer's cent and a half.
    expect(lanes.triage.spentUsd).toBeCloseTo(100 / 1e6, 12);
    expect(lanes.group.spentUsd).toBeCloseTo(costOf(REPLY, DEFAULT_ANSWER_MODEL), 12);
  });

  it("charges a request that may have been billed its reservation, priced on its own model", () => {
    const budget = ledger();
    const worst = answerWorst("claude-opus-5-5");
    const ticket = budget.reserve("private", worst, T0, "claude-opus-5-5")!;
    expect(budget.commit(ticket, null, "timeout", T0)).toBe(worst);
  });

  it("refuses a request on a model without a rate card, without counting it", () => {
    const budget = ledger();
    expect(budget.reserve("group", 0.01, T0, "claude-opus-4-8" as ClaudeModel)).toBeNull();
    expect(budget.status(T0).lanes.group.calls).toBe(0);
  });

  it("refuses an answer the day has no room for without closing the day, so checks may use the rest", () => {
    const events: string[] = [];
    const budget = createBudget({ capUsd: 3, saved: null, off: null, save: () => undefined, saveOff: () => undefined, onEvent: (e) => void events.push(e), now: () => T0 });
    // Checks have used more than their 10%: $2.90 of the day is gone, and a Sonnet answer's worst case ($0.13) is more than what's left.
    budget.commit(budget.reserve("triage", 2.9, T0, TRIAGE_MODEL)!, costing(2.9), null, T0);
    expect(budget.reserve("group", answerWorst(DEFAULT_ANSWER_MODEL), T0, DEFAULT_ANSWER_MODEL)).toBeNull();
    expect(events).toEqual(["warn80"]);
    expect(budget.status(T0)).toMatchObject({ on: true, reason: null });
    const check = budget.reserve("triage", worstCaseUsd(17_000, 400, TRIAGE_MODEL), T0, TRIAGE_MODEL);
    expect(check).not.toBeNull();
    // A check the day has no room for is refused too, and the day closes, for every call, only once its spending reaches the cap.
    expect(budget.reserve("triage", 0.2, T0, TRIAGE_MODEL)).toBeNull();
    expect(events).toEqual(["warn80"]);
    budget.commit(check!, VERDICT, null, T0);
    budget.commit(budget.reserve("triage", 0.0999, T0, TRIAGE_MODEL)!, costing(0.0999), null, T0);
    expect(events).toEqual(["warn80", "cap"]);
    expect(budget.status(T0)).toMatchObject({ on: false, reason: "cap" });
    // Never past the cap, but for rounding noise.
    expect(budget.status(T0).spentUsd).toBeLessThanOrEqual(3 + 1e-9);
  });

  it("holds the bot's 4 answers at once in the group lane even on Opus 5.5, whose worst cases are the largest", () => {
    const held = (model: AnswerModel) => {
      const budget = ledger();
      let n = 0;
      while (budget.reserve("group", answerWorst(model), T0, model) !== null) n += 1;
      return n;
    };
    // The group lane's $1.35 holds 10 worst cases on Sonnet 5.5 ($0.1291 each) and 5 on Opus 5.5 ($0.2583).
    expect([held("claude-sonnet-5-5"), held("claude-opus-5-5")]).toEqual([10, 5]);
    expect(held("claude-haiku-5-5")).toBeGreaterThan(100);
  });
});
