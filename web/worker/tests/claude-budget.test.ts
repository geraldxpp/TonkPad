import { describe, expect, it } from "vitest";
import { type BudgetEvent, type BudgetOptions, createBudget, LANE_SHARES, TRIAGE_KEEP } from "../src/telegram/claude/budget";
import type { Budget, ClaudeFailure, Lane, Usage } from "../src/telegram/claude/types";
import type { AiOff, SpendRecord } from "../src/telegram/community/types";
import { costing, HAIKU } from "./claude-budget-fixtures";

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
const MIDNIGHT = Date.UTC(2026, 10, 25);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** A $3 budget at T0 that records what it saves and the events it sends. */
function harness(extra: Partial<BudgetOptions> = {}) {
  const saves: SpendRecord[] = [];
  const offs: Array<AiOff | null> = [];
  const events: Array<{ event: BudgetEvent; lane: Lane | null }> = [];
  const budget = createBudget({
    capUsd: 3,
    saved: null,
    off: null,
    save: (s) => void saves.push(s),
    saveOff: (v) => void offs.push(v),
    onEvent: (event, _status, lane) => void events.push({ event, lane }),
    now: () => T0,
    ...extra,
  });
  return { budget, saves, offs, said: () => events.map((e) => (e.lane ? `${e.event}:${e.lane}` : e.event)) };
}

/** Reserves `usd` in a lane and charges exactly that; false when the reservation is refused. */
function spend(budget: Budget, lane: Lane, usd: number, now = T0): boolean {
  const ticket = budget.reserve(lane, usd, now, HAIKU);
  if (!ticket) return false;
  budget.commit(ticket, costing(usd), null, now);
  return true;
}

describe("the lanes", () => {
  it("split the day: group answers 45%, unprompted 15% and private 30%, checks keep 10%", () => {
    expect(LANE_SHARES).toEqual({ group: 0.45, proactive: 0.15, private: 0.3 });
    expect(TRIAGE_KEEP).toBe(0.1);
    const { lanes } = harness().budget.status(T0);
    expect([lanes.group.capUsd, lanes.proactive.capUsd, lanes.private.capUsd, lanes.triage.capUsd]).toEqual([1.35, 0.45, 0.9, 3]);
  });

  it("cap each answer lane on its own", () => {
    for (const [lane, cap] of [["group", 1.35], ["proactive", 0.45], ["private", 0.9]] as const) {
      const { budget, said } = harness();
      expect(spend(budget, lane, cap)).toBe(true);
      expect(budget.reserve(lane, 0.001, T0, HAIKU)).toBeNull();
      expect(budget.available(lane, T0)).toBe(false);
      expect(said()).toEqual([`lane:${lane}`]);
    }
  });

  it("stop the answer lanes together at 90% and leave the rest of the day to checks", () => {
    const { budget, said } = harness();
    expect(spend(budget, "proactive", 0.45)).toBe(true);
    expect(budget.reserve("proactive", 0.001, T0, HAIKU)).toBeNull();
    expect(spend(budget, "private", 0.9)).toBe(true);
    expect(budget.reserve("private", 0.001, T0, HAIKU)).toBeNull();
    // Group answers don't stop at 80% of the day: the lane fills to its 45%, 90% for answers in all.
    expect(spend(budget, "group", 1.35)).toBe(true);
    expect(budget.reserve("group", 0.01, T0, HAIKU)).toBeNull();
    expect(budget.status(T0).lanes.triage.capUsd).toBeCloseTo(0.3, 9);
    expect(budget.available("triage", T0)).toBe(true);
    expect(spend(budget, "triage", 0.3)).toBe(true);
    expect(budget.status(T0).spentUsd).toBeCloseTo(3, 9);
    expect(said()).toEqual(["lane:proactive", "lane:private", "warn80", "lane:group", "cap"]);
  });

  it("stop private and unprompted answers at 80% of the day, even with room left in their lanes", () => {
    const { budget, said } = harness();
    expect(spend(budget, "group", 1.35)).toBe(true);
    expect(spend(budget, "triage", 0.95)).toBe(true);
    // 2.30 spent: unprompted answers have 0.10 left before 80% of the day, though their lane holds 0.45. What doesn't fit is refused...
    expect(budget.reserve("proactive", 0.2, T0, HAIKU)).toBeNull();
    expect(said()).toEqual(["lane:group"]);
    // ...what fits runs, and the mark closes once spending reaches it.
    expect(spend(budget, "proactive", 0.1)).toBe(true);
    expect(said()).toEqual(["lane:group", "warn80"]);
    expect(budget.available("proactive", T0)).toBe(false);
  });

  it("let checks use the whole day when answers use none of it", () => {
    const { budget } = harness();
    expect(spend(budget, "triage", 2.99)).toBe(true);
    expect(budget.reserve("group", 0.02, T0, HAIKU)).toBeNull();
  });

  it("refuse quietly what doesn't fit only because other requests are in flight", () => {
    const { budget, said } = harness();
    const first = budget.reserve("group", 0.7, T0, HAIKU);
    expect(first).not.toBeNull();
    expect(budget.reserve("group", 0.7, T0, HAIKU)).toBeNull();
    expect(budget.available("group", T0)).toBe(true);
    budget.commit(first!, costing(0.001), null, T0);
    expect(budget.reserve("group", 0.7, T0, HAIKU)).not.toBeNull();
    expect(said()).toEqual([]);
  });

  it("stop private and unprompted answers at 80% of the day, and say so once", () => {
    const { budget, said } = harness();
    expect(spend(budget, "triage", 2.3)).toBe(true);
    expect(budget.reserve("private", 0.2, T0, HAIKU)).toBeNull();
    expect(said()).toEqual([]);
    expect(spend(budget, "triage", 0.1)).toBe(true);
    expect(said()).toEqual(["warn80"]);
    expect(budget.available("private", T0)).toBe(false);
    expect(budget.available("proactive", T0)).toBe(false);
    expect(budget.reserve("proactive", 0.0001, T0, HAIKU)).toBeNull();
    expect(budget.available("group", T0)).toBe(true);
    expect(spend(budget, "group", 0.5)).toBe(true);
    expect(spend(budget, "triage", 0.05)).toBe(true);
    expect(said()).toEqual(["warn80"]);
  });

  it("close the 80% mark when spending reaches it", () => {
    const { budget, said } = harness();
    expect(spend(budget, "triage", 2.4)).toBe(true);
    expect(said()).toEqual(["warn80"]);
    expect(budget.reserve("private", 0.0001, T0, HAIKU)).toBeNull();
  });
});

describe("the day's cap", () => {
  it("blocks every call until the next UTC day, once its spending reaches the cap", () => {
    const { budget, said } = harness();
    expect(spend(budget, "triage", 2.998)).toBe(true);
    // A check that would pass the cap is refused, and the day stays open for one that fits.
    expect(budget.reserve("triage", 0.003, T0, HAIKU)).toBeNull();
    expect(budget.status(T0)).toMatchObject({ on: true, reason: null });
    expect(spend(budget, "triage", 0.002)).toBe(true);
    expect(budget.status(T0)).toMatchObject({ on: false, reason: "cap", until: MIDNIGHT });
    expect(budget.reserve("triage", 0.001, T0 + 1, HAIKU)).toBeNull();
    expect(budget.available("triage", MIDNIGHT - 1)).toBe(false);
    expect(budget.status(MIDNIGHT)).toMatchObject({ day: "2026-11-25", on: true, reason: null, spentUsd: 0, until: null });
    expect(budget.reserve("triage", 0.003, MIDNIGHT, HAIKU)).not.toBeNull();
    expect(said()).toEqual(["warn80", "cap"]);
  });

  it("sends each event once a day, and again the next day", () => {
    const { budget, said } = harness();
    const day = (start: number) => {
      expect(spend(budget, "group", 1.35, start)).toBe(true);
      expect(budget.reserve("group", 0.01, start, HAIKU)).toBeNull();
      expect(budget.reserve("group", 0.01, start, HAIKU)).toBeNull();
      expect(spend(budget, "triage", 1, start)).toBe(true);
      expect(spend(budget, "triage", 0.1, start)).toBe(true);
      expect(budget.reserve("triage", 0.6, start, HAIKU)).toBeNull();
      expect(spend(budget, "triage", 0.55, start)).toBe(true);
      expect(budget.reserve("triage", 0.01, start, HAIKU)).toBeNull();
      expect(budget.reserve("triage", 0.01, start, HAIKU)).toBeNull();
    };
    day(T0);
    expect(said()).toEqual(["lane:group", "warn80", "cap"]);
    day(T0 + DAY);
    expect(said()).toEqual(["lane:group", "warn80", "cap", "lane:group", "warn80", "cap"]);
  });
});

describe("charging", () => {
  it("charges a reply's real cost, releases a failure the API answered, keeps a timeout or network failure", () => {
    // A fresh budget for each: a commit's failure also counts toward its kind's breaker (claude-budget-kinds.test.ts).
    const charge = (usage: Usage | null, failure: ClaudeFailure | null) => {
      const { budget, saves } = harness();
      const usd = budget.commit(budget.reserve("group", 0.2, T0, HAIKU)!, usage, failure, T0);
      expect(saves).toEqual([{ day: "2026-11-24", lanes: { triage: 0, group: usd, proactive: 0, private: 0 } }]);
      expect(budget.status(T0).lanes.group).toMatchObject({ spentUsd: usd, calls: 1 });
      return usd;
    };
    expect(charge(costing(0.001), null)).toBeCloseTo(0.001, 12);
    for (const failure of ["server", "rate_limited", "overloaded", "auth", "billing", "not_found", "bad_request", "ramp"] as const) expect(charge(null, failure)).toBe(0);
    expect(charge(null, null)).toBe(0);
    expect(charge(null, "timeout")).toBe(0.2);
    expect(charge(null, "network")).toBe(0.2);
    expect(charge(null, "unknown")).toBe(0.2);
  });

  it("charges a ticket once, and nothing for one it never issued", () => {
    const { budget } = harness();
    const ticket = budget.reserve("triage", 0.1, T0, HAIKU)!;
    expect(budget.commit(ticket, null, "timeout", T0)).toBe(0.1);
    expect(budget.commit(ticket, null, "timeout", T0)).toBe(0);
    expect(budget.commit({ id: 999, lane: "triage", worstUsd: 1, model: HAIKU }, null, "timeout", T0)).toBe(0);
    expect(budget.status(T0).spentUsd).toBe(0.1);
  });

  it("refuses a worst case that isn't a number of dollars", () => {
    const { budget } = harness();
    for (const worst of [Number.NaN, -0.01, Number.POSITIVE_INFINITY]) expect(budget.reserve("triage", worst, T0, HAIKU)).toBeNull();
  });

  it("keeps every call off with a cap of 0", () => {
    const { budget } = harness({ capUsd: 0 });
    expect(budget.status(T0)).toMatchObject({ on: false, reason: "off" });
    expect(budget.reserve("triage", 0, T0, HAIKU)).toBeNull();
  });
});

describe("saved state", () => {
  it("restores today's spending, and ignores another day's", () => {
    const first = harness();
    spend(first.budget, "group", 0.4);
    spend(first.budget, "triage", 0.2);
    const saved = first.saves.at(-1)!;
    expect(saved).toEqual({ day: "2026-11-24", lanes: { triage: 0.2, group: 0.4, proactive: 0, private: 0 } });
    const again = harness({ saved });
    expect(again.budget.status(T0).spentUsd).toBeCloseTo(0.6, 9);
    // 0.40 of the group lane's 1.35 is spent: 0.90 more fits, and nothing past it while that is in flight.
    expect(again.budget.reserve("group", 0.9, T0, HAIKU)).not.toBeNull();
    expect(again.budget.reserve("group", 0.1, T0, HAIKU)).toBeNull();
    const stale = harness({ saved: { ...saved, day: "2026-11-23" } });
    expect(stale.budget.status(T0).spentUsd).toBe(0);
  });

  it("restores a day past 80% with private answers stopped, without a second alert", () => {
    const { budget, said } = harness({ saved: { day: "2026-11-24", lanes: { triage: 2.5, group: 0, proactive: 0, private: 0 } } });
    expect(budget.available("private", T0)).toBe(false);
    expect(budget.reserve("private", 0.001, T0, HAIKU)).toBeNull();
    expect(budget.reserve("group", 0.001, T0, HAIKU)).not.toBeNull();
    expect(said()).toEqual([]);
  });
});
