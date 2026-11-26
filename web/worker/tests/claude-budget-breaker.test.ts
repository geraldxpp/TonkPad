import { describe, expect, it } from "vitest";
import { type BudgetEvent, type BudgetOptions, createBudget } from "../src/telegram/claude/budget";
import type { ClaudeFailure } from "../src/telegram/claude/types";
import type { AiOff } from "../src/telegram/community/types";
import { costing, HAIKU } from "./claude-budget-fixtures";

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** A $3 budget at T0 that records its saved AI-off switch and the events it sends. */
function harness(extra: Partial<BudgetOptions> = {}) {
  const offs: Array<AiOff | null> = [];
  const events: BudgetEvent[] = [];
  const budget = createBudget({
    capUsd: 3,
    saved: null,
    off: null,
    save: () => undefined,
    saveOff: (v) => void offs.push(v),
    onEvent: (event) => void events.push(event),
    now: () => T0,
    ...extra,
  });
  /** Whether a small check could be reserved at `now` (and settles it at once, as never sent). */
  const opens = (now: number) => {
    const ticket = budget.reserve("triage", 0.001, now, HAIKU);
    if (ticket) budget.commit(ticket, null, null, now);
    return ticket !== null;
  };
  /** A check that fails as mod/triage.ts settles it: the failure first, then the ticket. False when it couldn't be reserved. */
  const fails = (failure: ClaudeFailure, now: number) => {
    const ticket = budget.reserve("triage", 0.001, now, HAIKU);
    budget.failed(failure, null, now);
    if (ticket) budget.commit(ticket, null, failure, now);
    return ticket !== null;
  };
  /** A check that gets a reply; false when it couldn't be reserved. */
  const replies = (now: number) => {
    const ticket = budget.reserve("triage", 0.001, now, HAIKU);
    if (ticket) budget.commit(ticket, costing(0.0001), null, now);
    return ticket !== null;
  };
  return { budget, offs, events, opens, fails, replies };
}

describe("the breaker", () => {
  it("opens for 10 minutes after 5 transient failures within 5 minutes, once", () => {
    const { budget, events, opens, fails, replies } = harness();
    const kinds: ClaudeFailure[] = ["timeout", "network", "rate_limited", "overloaded"];
    kinds.forEach((kind, i) => fails(kind, T0 + i * MIN));
    expect(opens(T0 + 4 * MIN)).toBe(true);
    const late = budget.reserve("triage", 0.001, T0 + 4 * MIN, HAIKU)!;
    fails("server", T0 + 4 * MIN + 59_000);
    expect(events).toEqual(["circuit"]);
    const opened = T0 + 4 * MIN + 59_000;
    // A check sent before the breaker opened fails after it: no second alert.
    budget.failed("unknown", null, opened + 1);
    budget.commit(late, null, "unknown", opened + 1);
    expect(events).toEqual(["circuit"]);
    expect(opens(opened + 10 * MIN - 1)).toBe(false);
    expect(opens(opened + 10 * MIN)).toBe(true);
    expect(events).toEqual(["circuit"]);
    expect(replies(opened + 10 * MIN)).toBe(true);
    expect(events).toEqual(["circuit", "restored"]);
  });

  it("stays shut when the 5 failures spread over more than 5 minutes", () => {
    const { events, opens, fails } = harness();
    for (let i = 0; i < 5; i += 1) fails("timeout", T0 + i * 75_000);
    expect(opens(T0 + 5 * 75_000)).toBe(true);
    expect(events).toEqual([]);
  });
});

describe("billing and a missing model", () => {
  it.each(["billing", "not_found"] as const)("%s turns AI off until an owner's /ai on, across a reload", (failure) => {
    const first = harness();
    first.budget.failed(failure, null, T0);
    first.budget.failed(failure, null, T0 + 1);
    expect(first.events).toEqual([failure]);
    expect(first.offs).toEqual([{ reason: failure, since: T0 }]);
    expect(first.budget.status(T0 + 3 * DAY)).toMatchObject({ on: false, reason: failure });
    expect(first.opens(T0 + 3 * DAY)).toBe(false);

    const reloaded = harness({ off: first.offs[0] });
    expect(reloaded.budget.available("triage", T0 + 4 * DAY)).toBe(false);
    reloaded.budget.setOn(true, T0 + 4 * DAY);
    expect(reloaded.offs).toEqual([null]);
    expect(reloaded.events).toEqual([]);
    expect(reloaded.opens(T0 + 4 * DAY)).toBe(true);
    expect(reloaded.replies(T0 + 4 * DAY)).toBe(true);
    expect(reloaded.events).toEqual(["restored"]);
  });
});

describe("a ramp limit", () => {
  it("waits Anthropic's retry-after, or 10 seconds, without the breaker or an event, and says so in /status", () => {
    const { budget, events, opens } = harness();
    budget.failed("ramp", 2_000, T0);
    expect(budget.available("triage", T0 + 1_999)).toBe(false);
    expect(budget.status(T0 + 1_999)).toMatchObject({ on: false, reason: "ramp", until: T0 + 2_000 });
    expect(budget.status(T0 + 2_000)).toMatchObject({ on: true, reason: null, until: null });
    expect(opens(T0 + 2_000)).toBe(true);
    budget.failed("ramp", null, T0 + 3_000);
    expect(opens(T0 + 12_999)).toBe(false);
    expect(opens(T0 + 13_000)).toBe(true);
    for (let i = 0; i < 10; i += 1) budget.failed("ramp", 1, T0 + 14_000 + i);
    expect(opens(T0 + 15_000)).toBe(true);
    expect(events).toEqual([]);
  });

  it("never waits longer than 10 minutes", () => {
    const { budget, opens } = harness();
    budget.failed("ramp", 5 * 60 * MIN, T0);
    expect(opens(T0 + 10 * MIN)).toBe(true);
  });
});

describe("an owner's switch", () => {
  it("saves off as admin, and turns it back on without an alert", () => {
    const { budget, offs, events, opens } = harness();
    budget.setOn(false, T0);
    budget.setOn(false, T0 + 1);
    expect(offs).toEqual([{ reason: "admin", since: T0 }]);
    expect(budget.status(T0)).toMatchObject({ on: false, reason: "admin" });
    expect(opens(T0 + 1)).toBe(false);
    budget.setOn(true, T0 + 2);
    budget.setOn(true, T0 + 3);
    expect(offs).toEqual([{ reason: "admin", since: T0 }, null]);
    expect(opens(T0 + 3)).toBe(true);
    expect(events).toEqual([]);
  });

  it("turns off over a billing stop, and on again", () => {
    const { budget, offs } = harness();
    budget.failed("billing", null, T0);
    budget.setOn(false, T0 + 1);
    expect(offs).toEqual([{ reason: "billing", since: T0 }, { reason: "admin", since: T0 + 1 }]);
    budget.setOn(true, T0 + 2);
    expect(budget.status(T0 + 2)).toMatchObject({ on: true, reason: null });
  });
});

describe("the ledger's neighbours", () => {
  it("count refusals and errors for /status, and start each day at zero", () => {
    const { budget } = harness();
    budget.refused("group");
    budget.refused("private");
    budget.failed("server", null, T0);
    expect(budget.status(T0)).toMatchObject({ refusals: 2, errors: 1 });
    expect(budget.status(T0 + DAY)).toMatchObject({ refusals: 0, errors: 0 });
  });

  it("charges a request still in flight at midnight to the new day", () => {
    const { budget } = harness();
    const midnight = Date.UTC(2026, 10, 25);
    const ticket = budget.reserve("group", 0.7, midnight - 1, HAIKU)!;
    expect(budget.reserve("group", 0.7, midnight, HAIKU)).toBeNull();
    expect(budget.commit(ticket, null, "timeout", midnight + 1)).toBe(0.7);
    expect(budget.status(midnight + 1)).toMatchObject({ day: "2026-11-25", spentUsd: 0.7 });
  });

  it("never let an alert or a save that throws break a call", () => {
    const { budget } = harness({
      save: () => {
        throw new Error("disk full");
      },
      saveOff: () => {
        throw new Error("disk full");
      },
      onEvent: () => {
        throw new Error("alert failed");
      },
    });
    const ticket = budget.reserve("group", 1.35, T0, HAIKU)!;
    expect(budget.commit(ticket, null, "timeout", T0)).toBe(1.35);
    expect(budget.reserve("group", 0.01, T0, HAIKU)).toBeNull();
    budget.failed("billing", null, T0);
    expect(budget.status(T0)).toMatchObject({ on: false, reason: "billing" });
    budget.setOn(true, T0);
    expect(budget.status(T0)).toMatchObject({ on: true });
  });
});
