import { describe, expect, it } from "vitest";
import { type BudgetEvent, createBudget } from "../src/telegram/claude/budget";
import type { Budget, ClaudeFailure, Lane } from "../src/telegram/claude/types";
import { costing, HAIKU } from "./claude-budget-fixtures";

/**
 * Fix round 2 (answers#13): with two breakers, each kind's stop is said on
 * its own (checks paused, answers paused), once per streak, and each kind's
 * return after its first reply; AI's return only once every kind that
 * stopped has had one. Driven as claude-budget-kinds.test.ts drives the
 * budget: a check reports its failure and then settles its ticket, an
 * answer settles each attempt and then reports the final failure.
 */

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
const MIN = 60_000;

/** A $3 budget that records each event with the kind of call it is about ("-" for every call). */
function harness() {
  const told: string[] = [];
  const onEvent = (event: BudgetEvent, _status: unknown, _lane: unknown, kind: string | null) => void told.push(`${event}:${kind ?? "-"}`);
  const budget = createBudget({ capUsd: 3, saved: null, off: null, save: () => undefined, saveOff: () => undefined, onEvent, now: () => T0 });
  return { budget, told };
}

function fail(budget: Budget, lane: Lane, failure: ClaudeFailure, now: number): boolean {
  const ticket = budget.reserve(lane, 0.001, now, HAIKU);
  if (!ticket) return false;
  if (lane === "triage") budget.failed(failure, null, now);
  budget.commit(ticket, null, failure, now);
  if (lane !== "triage") budget.failed(failure, null, now);
  return true;
}

function answered(budget: Budget, lane: Lane, now: number): boolean {
  const ticket = budget.reserve(lane, 0.001, now, HAIKU);
  if (!ticket) return false;
  budget.commit(ticket, costing(0.0001), null, now);
  return true;
}

describe("each kind's stop and return, said on its own (answers#13)", () => {
  it("says each kind's pause and return on its own, and AI's return once every kind that stopped has had a reply (answers#13)", () => {
    const { budget, told } = harness();
    for (let i = 0; i < 5; i += 1) fail(budget, "triage", "network", T0 + i);
    for (let i = 0; i < 5; i += 1) fail(budget, "group", "network", T0 + 10 + i);
    expect(told).toEqual(["circuit:triage", "circuit:answer"]);
    expect(answered(budget, "triage", T0 + 11 * MIN)).toBe(true);
    expect(told).toEqual(["circuit:triage", "circuit:answer", "restored:triage"]);
    expect(answered(budget, "group", T0 + 11 * MIN)).toBe(true);
    expect(told).toEqual(["circuit:triage", "circuit:answer", "restored:triage", "restored:-"]);
  });

  it("says the checks' pause while an earlier answers' pause is still unresolved (answers#13)", () => {
    const { budget, told } = harness();
    // Answers time out 5 times at 10:00; their pause ends at 10:10, but nobody asks anything.
    for (let i = 0; i < 5; i += 1) fail(budget, "group", "timeout", T0 + i);
    expect(told).toEqual(["circuit:answer"]);
    // At 10:20 moderation checks time out 5 times: the admins hear that Haiku's check is off.
    for (let i = 0; i < 5; i += 1) fail(budget, "triage", "timeout", T0 + 20 * MIN + i);
    expect(told).toEqual(["circuit:answer", "circuit:triage"]);
    expect(budget.available("triage", T0 + 21 * MIN)).toBe(false);
    // The checks come back first: said on their own, since the answers haven't had a reply yet.
    expect(answered(budget, "triage", T0 + 31 * MIN)).toBe(true);
    expect(told).toEqual(["circuit:answer", "circuit:triage", "restored:triage"]);
    // A new streak of check failures is said again; the answers' return then waits for the checks too.
    for (let i = 0; i < 5; i += 1) fail(budget, "triage", "timeout", T0 + 32 * MIN + i);
    expect(told.slice(3)).toEqual(["circuit:triage"]);
    expect(answered(budget, "group", T0 + 33 * MIN)).toBe(true);
    expect(told.slice(3)).toEqual(["circuit:triage", "restored:answer"]);
    expect(answered(budget, "triage", T0 + 43 * MIN)).toBe(true);
    expect(told.slice(3)).toEqual(["circuit:triage", "restored:answer", "restored:-"]);
  });

  it("says a bad request with its kind, and nothing per kind for a stop of every call", () => {
    const { budget, told } = harness();
    expect(fail(budget, "triage", "bad_request", T0)).toBe(true);
    expect(fail(budget, "group", "auth", T0 + MIN)).toBe(true);
    expect(told).toEqual(["bad_request:triage", "auth:-"]);
    // A check's reply while the key is refused proves nothing yet: no return is said.
    expect(answered(budget, "triage", T0 + 16 * MIN)).toBe(false);
    expect(answered(budget, "triage", T0 + 61 * MIN)).toBe(true);
    expect(told).toEqual(["bad_request:triage", "auth:-", "restored:-"]);
  });
});
