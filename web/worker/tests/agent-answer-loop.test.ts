// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerQuestion } from "../src/telegram/agent/answer";
import { GRACE_MS } from "../src/telegram/agent/answer-request";
import { createBudget } from "../src/telegram/claude/budget";
import { type Budget, type ClaudeClient, type ClaudeFailure, type ClaudeOutcome, LANES, TRIAGE_MODEL } from "../src/telegram/claude/types";
import { failure, fakeClaude, ok, type ScriptStep } from "./community-fixtures";
import { deps, endTurn, figuresUse, request, toolTurn, worstByHand } from "./agent-answer-fixtures";
import { NOW } from "./fixtures";

afterEach(() => {
  vi.useRealTimers();
});

/** A clock the script moves: each step takes `ms` of it before giving its outcome. */
function timed(clock: { now: number }, ms: number, step: ScriptStep): ScriptStep {
  return (req) => {
    clock.now += ms;
    return typeof step === "function" ? step(req) : step;
  };
}

describe("answerQuestion: the loop's limits, on Haiku 5.5 (agent-answer-models.test.ts has Sonnet's and Opus's)", () => {
  it("sends at most 3 requests, a retry included, each reserved at its worst case (the tool prompt included) and settled once", async () => {
    const client = fakeClaude([ok(toolTurn(figuresUse("toolu_a"))), failure("network"), ok(toolTurn(figuresUse("toolu_b")))]);
    const d = deps(client);
    expect(await answerQuestion(request(), d)).toEqual({ kind: "declined", reason: "invalid" });
    expect(client.calls).toHaveLength(3);
    expect(d.budget.tickets.map((t) => [t.id, t.lane, t.model])).toEqual([[1, "group", "claude-haiku-5-5"], [2, "group", "claude-haiku-5-5"], [3, "group", "claude-haiku-5-5"]]);
    client.calls.forEach((call, i) => expect(d.budget.tickets[i].worstUsd).toBeCloseTo(worstByHand(call.params, "claude-haiku-5-5", 8000), 12));
    expect(d.budget.commits).toEqual([1, 2, 3]);
    expect(d.budget.settled.map((s) => [s.usage !== null, s.failure])).toEqual([[true, null], [false, "network"], [true, null]]);
    // The retry resends the same conversation; the failure it recovered from never reaches the breaker.
    expect(client.calls[2].params).toEqual(client.calls[1].params);
    expect(d.budget.failures).toEqual([]);
  });

  it("gives each request min(20 s, what's left of Haiku's 45 s)", async () => {
    const clock = { now: NOW };
    const client = fakeClaude([timed(clock, 18_000, ok(toolTurn(figuresUse()))), timed(clock, 15_000, failure("server")), timed(clock, 5_000, ok(endTurn()))]);
    const result = await answerQuestion(request(), deps(client, { now: () => clock.now }));
    expect(result.kind).toBe("answer");
    expect(client.calls.map((c) => c.timeoutMs)).toEqual([20_000, 20_000, 12_000]);
  });

  it("sends nothing once less than 3 seconds of the deadline are left", async () => {
    const clock = { now: NOW };
    const client = fakeClaude([timed(clock, 42_500, ok(toolTurn(figuresUse())))]);
    const d = deps(client, { now: () => clock.now });
    expect(await answerQuestion(request(), d)).toEqual({ kind: "unavailable", reason: "timeout" });
    expect(client.calls).toHaveLength(1);
    expect(d.budget.tickets).toHaveLength(1);
  });

  it("retries a network failure, an overload, a server error or a rate limit once; a second failure counts once toward the breaker", async () => {
    for (const kind of ["network", "overloaded", "server", "rate_limited"] as const) {
      const client = fakeClaude([failure(kind, null, 1), failure(kind, null, 1)]);
      const d = deps(client);
      expect(await answerQuestion(request(), d)).toEqual({ kind: "unavailable", reason: "error" });
      expect(client.calls).toHaveLength(2);
      expect(d.budget.failures).toEqual([kind]);
      expect(d.budget.settled.map((s) => s.failure)).toEqual([kind, kind]);
    }
    const recovered = fakeClaude([failure("overloaded", 529, 1), ok(endTurn())]);
    const d = deps(recovered);
    expect((await answerQuestion(request(), d)).kind).toBe("answer");
    expect(d.budget.failures).toEqual([]);
  });

  it("never retries what can't succeed, and tells the breaker at once", async () => {
    const kinds: ClaudeFailure[] = ["auth", "billing", "not_found", "bad_request", "ramp", "unknown"];
    for (const kind of kinds) {
      const client = fakeClaude([failure(kind, 400, 5_000)]);
      const d = deps(client);
      expect(await answerQuestion(request(), d)).toEqual({ kind: "unavailable", reason: "error" });
      expect(client.calls).toHaveLength(1);
      expect(d.budget.failures).toEqual([kind]);
    }
  });

  it("waits a rate limit's retry-after only when the retry still fits before the deadline", async () => {
    const late = fakeClaude([failure("rate_limited", 429, 60_000)]);
    const d = deps(late);
    expect(await answerQuestion(request(), d)).toEqual({ kind: "unavailable", reason: "error" });
    expect(late.calls).toHaveLength(1);
    expect(d.budget.failures).toEqual(["rate_limited"]);
    vi.useFakeTimers();
    const soon = fakeClaude([failure("rate_limited", 429, 4_000), ok(endTurn())]);
    const pending = answerQuestion(request(), deps(soon, { now: () => Date.now() }));
    await vi.advanceTimersByTimeAsync(3_999);
    expect(soon.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).kind).toBe("answer");
    expect(soon.calls).toHaveLength(2);
  });

  it("never retries a timed-out request at the same settings: one request, charged once, one failure for the breaker", async () => {
    const client = fakeClaude([failure("timeout", null, 1), ok(endTurn())]);
    const d = deps(client);
    expect(await answerQuestion(request(), d)).toEqual({ kind: "unavailable", reason: "timeout" });
    expect(client.calls).toHaveLength(1);
    expect(d.budget.settled.map((s) => s.failure)).toEqual(["timeout"]);
    expect(d.budget.failures).toEqual(["timeout"]);
  });

  it("gives up on a call that never ends a little past its timeout, as a timeout it may have been billed for, and sends no second", async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const stalled: ClaudeClient = { create: () => (calls.push(Date.now()), new Promise(() => undefined)), countTokens: async () => null };
    const d = deps(stalled, { now: () => Date.now() });
    const pending = answerQuestion(request(), d);
    await vi.advanceTimersByTimeAsync(20_000 + GRACE_MS);
    expect(await pending).toEqual({ kind: "unavailable", reason: "timeout" });
    expect(d.budget.settled).toEqual([{ ticket: d.budget.tickets[0], usage: null, failure: "timeout" }]);
    expect(d.budget.failures).toEqual(["timeout"]);
    expect(calls).toHaveLength(1);
  });

  it("tells the budget whose failure it was (the lane) and passes a failure's type on to the charge", async () => {
    const seen: Array<string | null | undefined> = [];
    const lanes: Array<string | null | undefined> = [];
    const d = deps(fakeClaude([{ ok: false, failure: "network", type: "unsent", status: null, retryAfterMs: null }, { ok: false, failure: "network", type: null, status: null, retryAfterMs: null }]));
    const commit = d.budget.commit;
    d.budget.commit = (ticket, usage, failed, now, type) => (seen.push(type), commit(ticket, usage, failed, now, type));
    const failed = d.budget.failed;
    d.budget.failed = (kind, retryAfterMs, now, lane) => (lanes.push(lane), failed(kind, retryAfterMs, now, lane));
    expect(await answerQuestion(request({ lane: "private", chat: "private" }), d)).toEqual({ kind: "unavailable", reason: "error" });
    expect(seen).toEqual(["unsent", null]);
    expect(lanes).toEqual(["private"]);
  });

  it("never rejects: a client or a budget that throws ends in a plain result", async () => {
    const d = deps(fakeClaude([]));
    await expect(answerQuestion(request(), d)).resolves.toEqual({ kind: "unavailable", reason: "error" });
    expect(d.budget.settled).toEqual([{ ticket: d.budget.tickets[0], usage: null, failure: "unknown" }]);
    const shaky = deps(fakeClaude([failure("auth", 401)]));
    shaky.budget.failed = () => {
      throw new Error("ledger down");
    };
    await expect(answerQuestion(request(), shaky)).resolves.toEqual({ kind: "unavailable", reason: "error" });
    const broken = deps(fakeClaude([ok(endTurn())]));
    broken.budget.reserve = () => {
      throw new Error("ledger down");
    };
    await expect(answerQuestion(request(), broken)).resolves.toEqual({ kind: "unavailable", reason: "error" });
  });
});

/** The bot's own ledger (claude/budget.ts) at a $3 cap, on the tests' fixed clock. */
const ledger = (): Budget => createBudget({ capUsd: 3, saved: null, off: null, save: () => undefined, saveOff: () => undefined, onEvent: () => undefined, now: () => NOW });
/** A network failure, retried after 1 ms; `type` "unsent" when the connection never reached Anthropic. */
const network = (type: string | null): ClaudeOutcome => ({ ok: false, failure: "network", type, status: null, retryAfterMs: 1 });

describe("answerQuestion with the bot's own ledger", () => {
  it("releases what a connection that never reached Anthropic reserved, and keeps what one that may have been billed did", async () => {
    const unsent = ledger();
    expect(await answerQuestion(request(), { ...deps(fakeClaude([network("unsent"), network("unsent")])), budget: unsent })).toEqual({ kind: "unavailable", reason: "error" });
    expect(unsent.status(NOW)).toMatchObject({ spentUsd: 0, errors: 1 });
    expect(unsent.status(NOW).lanes.group.calls).toBe(2);
    const billed = ledger();
    const client = fakeClaude([network(null), network(null)]);
    await answerQuestion(request(), { ...deps(client), budget: billed });
    const worst = client.calls.reduce((usd, call) => usd + worstByHand(call.params, "claude-haiku-5-5", 8000), 0);
    expect(billed.status(NOW).spentUsd).toBeCloseTo(worst, 9);
  });

  it("makes only answers wait out a ramp limit an answer met: moderation's checks still run", async () => {
    const budget = ledger();
    expect(await answerQuestion(request({ lane: "private", chat: "private" }), { ...deps(fakeClaude([failure("ramp", 429, 5_000)])), budget })).toEqual({ kind: "unavailable", reason: "error" });
    expect(LANES.map((lane) => [lane, budget.available(lane, NOW)])).toEqual([["triage", true], ["group", false], ["proactive", false], ["private", false]]);
    expect(budget.reserve("triage", 0.001, NOW, TRIAGE_MODEL)).not.toBeNull();
    expect(budget.status(NOW)).toMatchObject({ on: false, reason: "ramp", until: NOW + 5_000 });
    expect(budget.available("group", NOW + 5_000)).toBe(true);
  });
});
