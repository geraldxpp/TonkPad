import { describe, expect, it } from "vitest";
import { createBudget } from "../src/telegram/claude/budget";
import type { Budget, Lane } from "../src/telegram/claude/types";
import type { SpendRecord } from "../src/telegram/community/types";
import { costing, HAIKU } from "./claude-budget-fixtures";

/**
 * Review fix (model#1): reserve() only refuses a request that doesn't fit,
 * with no event and nothing closed. A lane, the 80% mark and the day's cap
 * close, each with its one event, only from commit(), once committed
 * spending reaches them: a worst case is several times a real request on
 * Sonnet 5.5 and Opus 5.5, so a gate that closed on one closed long before
 * its money was used. Checks keep their 10%, and nothing is reserved past
 * the cap.
 */

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);

/** A $3 day that records each event, with its lane when it has one. */
function harness(saved: SpendRecord | null = null) {
  const said: string[] = [];
  const budget = createBudget({
    capUsd: 3, saved, off: null, save: () => undefined, saveOff: () => undefined, now: () => T0,
    onEvent: (event, _status, lane) => void said.push(lane ? `${event}:${lane}` : event),
  });
  return { budget, said };
}

/** Reserves `usd` in a lane and charges exactly that; false when the reservation is refused. */
function spend(budget: Budget, lane: Lane, usd: number): boolean {
  const ticket = budget.reserve(lane, usd, T0, HAIKU);
  if (!ticket) return false;
  budget.commit(ticket, costing(usd), null, T0);
  return true;
}

describe("a gate closes only once committed spending reaches it (model#1)", () => {
  it("refuses an answer its lane can't take without closing the lane, and still lets one that fits through", () => {
    const { budget, said } = harness();
    expect(spend(budget, "group", 1.3)).toBe(true);
    // A Sonnet 5.5 answer's worst case is some $0.13: more than the $0.05 left of the group lane's $1.35.
    expect(budget.reserve("group", 0.13, T0, HAIKU)).toBeNull();
    expect(said).toEqual([]);
    expect(budget.available("group", T0)).toBe(true);
    // A real answer costs a fraction of its worst case: one that fits still runs, and the lane closes once its spending reaches the cap.
    expect(spend(budget, "group", 0.05)).toBe(true);
    expect(said).toEqual(["lane:group"]);
    expect(budget.available("group", T0)).toBe(false);
    expect(budget.reserve("group", 0.0001, T0, HAIKU)).toBeNull();
  });

  it("refuses a private or unprompted answer that would pass 80% of the day without closing the mark", () => {
    const { budget, said } = harness();
    expect(spend(budget, "triage", 2.3)).toBe(true);
    for (const lane of ["private", "proactive"] as const) expect(budget.reserve(lane, 0.13, T0, HAIKU)).toBeNull();
    expect(said).toEqual([]);
    expect([budget.available("private", T0), budget.available("proactive", T0)]).toEqual([true, true]);
    expect(spend(budget, "private", 0.05)).toBe(true);
    expect(said).toEqual([]);
    // $2.40 committed: the mark closes, once, for private and unprompted answers only.
    expect(spend(budget, "triage", 0.05)).toBe(true);
    expect(said).toEqual(["warn80"]);
    expect(["private", "proactive", "group"].map((lane) => budget.available(lane as Lane, T0))).toEqual([false, false, true]);
  });

  it("refuses a check that would pass the day's cap, and closes the day only once its spending reaches the cap", () => {
    const { budget, said } = harness();
    expect(spend(budget, "triage", 2.99)).toBe(true);
    expect(budget.reserve("triage", 0.02, T0, HAIKU)).toBeNull();
    expect(said).toEqual(["warn80"]);
    expect(budget.status(T0)).toMatchObject({ on: true, reason: null });
    expect(spend(budget, "triage", 0.01)).toBe(true);
    expect(said).toEqual(["warn80", "cap"]);
    expect(budget.status(T0)).toMatchObject({ on: false, reason: "cap" });
    expect(budget.reserve("triage", 0.0001, T0, HAIKU)).toBeNull();
  });

  it("never reserves past the cap, counting what is in flight, and keeps the checks' 10% from answers", () => {
    const { budget, said } = harness();
    // Unprompted and private first: their 80% mark counts what is in flight, group answers' doesn't.
    const answers = (["proactive", "private", "group"] as const).map((lane, i) => budget.reserve(lane, [0.45, 0.9, 1.35][i], T0, HAIKU));
    expect(answers.every((t) => t !== null)).toBe(true);
    // The answers hold 90% of the day: nothing more for them, and the checks' 10% is still theirs, up to the cap.
    expect(budget.reserve("group", 0.0001, T0, HAIKU)).toBeNull();
    const check = budget.reserve("triage", 0.3, T0, HAIKU);
    expect(check).not.toBeNull();
    expect(budget.reserve("triage", 0.0001, T0, HAIKU)).toBeNull();
    expect(said).toEqual([]);
    // Each charged its whole reservation: every gate closes as its spending reaches it, and the day stops at its cap.
    for (const ticket of [...answers, check]) budget.commit(ticket!, costing(ticket!.worstUsd), null, T0);
    expect(budget.status(T0).spentUsd).toBeCloseTo(3, 9);
    expect(said).toEqual(["lane:proactive", "lane:private", "warn80", "lane:group", "cap"]);
  });

  it("restores a lane today's saved spending filled as closed, without a second alert", () => {
    const { budget, said } = harness({ day: "2026-11-24", lanes: { triage: 0, group: 1.35, proactive: 0, private: 0 } });
    expect(budget.available("group", T0)).toBe(false);
    expect(budget.reserve("group", 0.0001, T0, HAIKU)).toBeNull();
    expect(budget.available("private", T0)).toBe(true);
    expect(said).toEqual([]);
  });
});
