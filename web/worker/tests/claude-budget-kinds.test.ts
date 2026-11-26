import { describe, expect, it } from "vitest";
import { type BudgetEvent, createBudget } from "../src/telegram/claude/budget";
import type { Budget, ClaudeFailure, Lane } from "../src/telegram/claude/types";
import { costing, HAIKU } from "./claude-budget-fixtures";

/**
 * The budget's breakers by kind of call, its announcements and its /status
 * reasons, driven as the bot's code drives them: a check reports its failure
 * and then settles its ticket (mod/triage.ts), an answer settles each
 * attempt and then reports the final failure (agent/answer.ts). A ramp
 * limit's wait is in claude-budget-breaker and claude-budget-outcomes.
 */

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
const MIN = 60_000;
const ANSWER_LANES = ["group", "proactive", "private"] as const;

function harness() {
  const events: BudgetEvent[] = [];
  const budget = createBudget({ capUsd: 3, saved: null, off: null, save: () => undefined, saveOff: () => undefined, onEvent: (event) => void events.push(event), now: () => T0 });
  return { budget, events };
}

/** One request in this lane that fails, settled in the order its caller uses; false when it couldn't be reserved. */
function fail(budget: Budget, lane: Lane, failure: ClaudeFailure, now: number, retryAfterMs: number | null = null): boolean {
  const ticket = budget.reserve(lane, 0.001, now, HAIKU);
  if (!ticket) return false;
  if (lane === "triage") budget.failed(failure, retryAfterMs, now);
  budget.commit(ticket, null, failure, now);
  if (lane !== "triage") budget.failed(failure, retryAfterMs, now);
  return true;
}

/** One request in this lane that gets a reply; false when it couldn't be reserved. */
function answered(budget: Budget, lane: Lane, now: number): boolean {
  const ticket = budget.reserve(lane, 0.001, now, HAIKU);
  if (!ticket) return false;
  budget.commit(ticket, costing(0.0001), null, now);
  return true;
}

const answersOpen = (budget: Budget, now: number) => ANSWER_LANES.map((lane) => budget.available(lane, now));

describe("checks and answers have their own breakers (claude#1)", () => {
  it("lets 5 timed-out answers within 5 minutes pause every answer lane for 10 minutes, never checks", () => {
    const { budget, events } = harness();
    for (let i = 0; i < 5; i += 1) expect(fail(budget, "private", "timeout", T0 + i * 30_000)).toBe(true);
    const opened = T0 + 2 * MIN;
    expect(events).toEqual(["circuit"]);
    expect(answersOpen(budget, opened + 10 * MIN - 1)).toEqual([false, false, false]);
    expect(budget.reserve("group", 0.001, opened + 1, HAIKU)).toBeNull();
    expect(budget.available("triage", opened)).toBe(true);
    expect(answered(budget, "triage", opened + 1)).toBe(true);
    expect(budget.status(opened + 1)).toMatchObject({ on: false, reason: "circuit", until: opened + 10 * MIN });
    expect(answersOpen(budget, opened + 10 * MIN)).toEqual([true, true, true]);
  });

  it("lets 5 failed checks within 5 minutes pause checks for 10 minutes, never answers", () => {
    const { budget, events } = harness();
    const kinds: ClaudeFailure[] = ["timeout", "network", "overloaded", "server", "unknown"];
    kinds.forEach((kind, i) => expect(fail(budget, "triage", kind, T0 + i * MIN)).toBe(true));
    const opened = T0 + 4 * MIN;
    expect(events).toEqual(["circuit"]);
    expect(budget.available("triage", opened + 10 * MIN - 1)).toBe(false);
    expect(answersOpen(budget, opened + 1)).toEqual([true, true, true]);
    expect(answered(budget, "group", opened + 1)).toBe(true);
    expect(budget.available("triage", opened + 10 * MIN)).toBe(true);
  });

  it("counts each failed attempt of an answer, the retry included", () => {
    const { budget, events } = harness();
    // Three questions, each tried twice: the fifth failed attempt opens the answers' breaker.
    for (let q = 0; q < 3; q += 1) {
      const now = T0 + q * MIN;
      for (const attempt of [0, 1]) {
        const ticket = budget.reserve("group", 0.001, now + attempt, HAIKU);
        if (ticket) budget.commit(ticket, null, "overloaded", now + attempt);
      }
      budget.failed("overloaded", null, now + 1);
    }
    expect(events).toEqual(["circuit"]);
    expect(budget.available("group", T0 + 3 * MIN)).toBe(false);
    expect(budget.available("triage", T0 + 3 * MIN)).toBe(true);
  });

  it("pauses only the kind of call a bad request came from, for 15 minutes", () => {
    const fromAnswer = harness();
    expect(fail(fromAnswer.budget, "group", "bad_request", T0)).toBe(true);
    expect(answersOpen(fromAnswer.budget, T0 + 15 * MIN - 1)).toEqual([false, false, false]);
    expect(fromAnswer.budget.available("triage", T0 + 1)).toBe(true);
    expect(answersOpen(fromAnswer.budget, T0 + 15 * MIN)).toEqual([true, true, true]);

    const fromCheck = harness();
    expect(fail(fromCheck.budget, "triage", "bad_request", T0)).toBe(true);
    expect(fromCheck.budget.available("triage", T0 + 15 * MIN - 1)).toBe(false);
    expect(answersOpen(fromCheck.budget, T0 + 1)).toEqual([true, true, true]);
  });

  it.each([
    ["auth", "private"],
    ["auth", "triage"],
    ["billing", "group"],
    ["not_found", "triage"],
  ] as const)("still stops every call after %s from the %s lane", (failure, lane) => {
    const { budget } = harness();
    expect(fail(budget, lane, failure, T0)).toBe(true);
    expect([budget.available("triage", T0 + 1), ...answersOpen(budget, T0 + 1)]).toEqual([false, false, false, false]);
  });

  it("still stops every call at an owner's /ai off", () => {
    const { budget } = harness();
    budget.setOn(false, T0);
    expect([budget.available("triage", T0), ...answersOpen(budget, T0)]).toEqual([false, false, false, false]);
  });
});

describe("what the admins are told (claude#4, words#2)", () => {
  it("announces a refused key as auth once per streak, and AI's return only after a reply", () => {
    const { budget, events } = harness();
    expect(fail(budget, "group", "auth", T0)).toBe(true);
    expect(events).toEqual(["auth"]);
    expect(budget.status(T0)).toMatchObject({ on: false, reason: "auth", until: T0 + 60 * MIN });
    expect(budget.available("triage", T0 + 60 * MIN - 1)).toBe(false);
    expect(budget.available("triage", T0 + 60 * MIN)).toBe(true);
    expect(events).toEqual(["auth"]);
    expect(fail(budget, "triage", "auth", T0 + 60 * MIN)).toBe(true);
    expect(events).toEqual(["auth"]);
    expect(budget.status(T0 + 60 * MIN)).toMatchObject({ reason: "auth", until: T0 + 120 * MIN });
    expect(answered(budget, "triage", T0 + 120 * MIN)).toBe(true);
    expect(events).toEqual(["auth", "restored"]);
    expect(fail(budget, "group", "auth", T0 + 121 * MIN)).toBe(true);
    expect(events).toEqual(["auth", "restored", "auth"]);
  });

  it("announces a bad request once per streak, and AI's return once that kind of call gets a reply", () => {
    const { budget, events } = harness();
    expect(fail(budget, "group", "bad_request", T0)).toBe(true);
    expect(events).toEqual(["bad_request"]);
    expect(budget.status(T0)).toMatchObject({ on: false, reason: "circuit", until: T0 + 15 * MIN });
    expect(answered(budget, "triage", T0 + MIN)).toBe(true);
    expect(fail(budget, "group", "bad_request", T0 + 15 * MIN)).toBe(true);
    expect(answered(budget, "triage", T0 + 31 * MIN)).toBe(true);
    expect(events).toEqual(["bad_request"]);
    expect(answered(budget, "private", T0 + 31 * MIN)).toBe(true);
    expect(events).toEqual(["bad_request", "restored"]);
  });

  it("says the breaker opened once, and AI's return after the first reply rather than on the timer", () => {
    const { budget, events } = harness();
    for (let i = 0; i < 5; i += 1) fail(budget, "triage", "timeout", T0 + i * MIN);
    const opened = T0 + 4 * MIN;
    expect(budget.status(opened + 10 * MIN)).toMatchObject({ on: true, reason: null });
    expect(events).toEqual(["circuit"]);
    for (let i = 0; i < 5; i += 1) fail(budget, "triage", "timeout", opened + 10 * MIN + i);
    expect(events).toEqual(["circuit"]);
    expect(answered(budget, "triage", opened + 30 * MIN)).toBe(true);
    expect(events).toEqual(["circuit", "restored"]);
  });

  it("after billing, lets /ai on run calls again: AI's return follows a reply, and billing again is said again", () => {
    const { budget, events } = harness();
    expect(fail(budget, "group", "billing", T0)).toBe(true);
    budget.setOn(true, T0 + MIN);
    expect(events).toEqual(["billing"]);
    expect(fail(budget, "triage", "billing", T0 + 2 * MIN)).toBe(true);
    expect(events).toEqual(["billing", "billing"]);
    budget.setOn(true, T0 + 3 * MIN);
    expect(answered(budget, "triage", T0 + 4 * MIN)).toBe(true);
    expect(events).toEqual(["billing", "billing", "restored"]);
    // An owner's /ai off over a billing stop, then /ai on: billing coming back is said again.
    expect(fail(budget, "group", "billing", T0 + 5 * MIN)).toBe(true);
    budget.setOn(false, T0 + 6 * MIN);
    budget.setOn(true, T0 + 7 * MIN);
    expect(fail(budget, "group", "billing", T0 + 8 * MIN)).toBe(true);
    expect(events).toEqual(["billing", "billing", "restored", "billing", "billing"]);
  });
});

describe("a connection that never reached Anthropic (claude#3)", () => {
  it("releases a network failure marked unsent, and keeps every other network failure or timeout", () => {
    const { budget } = harness();
    const charge = (failure: ClaudeFailure, type?: string | null) => budget.commit(budget.reserve("group", 0.2, T0, HAIKU)!, null, failure, T0, type);
    expect(charge("network", "unsent")).toBe(0);
    expect(charge("network")).toBe(0.2);
    expect(charge("network", null)).toBe(0.2);
    expect(charge("timeout", "unsent")).toBe(0.2);
    expect(budget.status(T0).lanes.group.spentUsd).toBeCloseTo(0.6, 9);
  });
});
