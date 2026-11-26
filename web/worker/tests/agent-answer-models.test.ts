// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANSWER_SETTINGS, answerQuestion } from "../src/telegram/agent/answer";
import { GRACE_MS } from "../src/telegram/agent/answer-request";
import { TYPING_EVERY_MS, TYPING_MAX_BEATS, typingBeats } from "../src/telegram/agent/jobs";
import { answerContext, answerSystem } from "../src/telegram/agent/prompt";
import { ANSWER_SCHEMA } from "../src/telegram/agent/schema";
import { ANSWER_TOOLS } from "../src/telegram/agent/tools";
import { createBudget } from "../src/telegram/claude/budget";
import { costOf } from "../src/telegram/claude/prices";
import { type AnswerModel, type ClaudeClient, type ClaudeOutcome, DEFAULT_ANSWER_MODEL } from "../src/telegram/claude/types";
import { CODE, deps, endTurn, figuresUse, OFFICIAL, pack, request, toolTurn, worstByHand } from "./agent-answer-fixtures";
import { failure, fakeClaude, ok, type ScriptStep } from "./community-fixtures";
import { NOW } from "./fixtures";

/**
 * The answer loop on each model answers may run on (TELEGRAM_AI_ANSWER_MODEL):
 * Sonnet 5.5, the bot's default, and Opus 5.5 at effort medium with 2,500
 * tokens, 40 seconds a request, 60 in all and nothing sent with less than 10
 * left (model#2), in the same request Haiku 5.5 gets (agent-answer.test.ts
 * and agent-answer-loop.test.ts pin Haiku's own settings); each request
 * reserved at its worst case with the tool prompt (model#3) and charged at
 * its model's prices.
 */

const LARGER: readonly AnswerModel[] = ["claude-sonnet-5-5", "claude-opus-5-5"];

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

describe("answerQuestion on each model", () => {
  it("runs on Sonnet 5.5 by default", () => {
    expect(DEFAULT_ANSWER_MODEL).toBe("claude-sonnet-5-5");
  });

  it.each(LARGER)("asks %s at effort medium with 2,500 tokens and 40 seconds, the request otherwise as Haiku's", async (model) => {
    const client = fakeClaude([ok(endTurn())]);
    const d = deps(client, { model });
    expect((await answerQuestion(request(), d)).kind).toBe("answer");
    const [{ kind, lane, timeoutMs, params }] = client.calls;
    expect({ kind, lane, timeoutMs }).toEqual({ kind: "answer", lane: "group", timeoutMs: 40_000 });
    expect(params).toEqual({
      model,
      max_tokens: 2500,
      output_config: { effort: "medium", format: { type: "json_schema", schema: ANSWER_SCHEMA } },
      tools: ANSWER_TOOLS,
      system: answerSystem(pack(), "en", OFFICIAL),
      messages: [{ role: "user", content: request().question }, { role: "system", content: answerContext(request()) }],
      metadata: { user_id: CODE },
    });
    // Thinking stays adaptive by being left out; no sampling, forced tool choice, prefill or fallbacks.
    for (const key of ["thinking", "temperature", "top_p", "top_k", "tool_choice", "fallbacks", "stop_sequences", "stream"]) expect(params).not.toHaveProperty(key);
    // The system prompt with its cache breakpoints, the tools, the system message and the code: byte for byte Haiku's.
    const haiku = fakeClaude([ok(endTurn())]);
    await answerQuestion(request(), deps(haiku));
    const rest = (p: object) => Object.fromEntries(Object.entries(p).filter(([key]) => !["model", "max_tokens", "output_config"].includes(key)));
    expect(JSON.stringify(rest(params))).toBe(JSON.stringify(rest(haiku.calls[0].params)));
    expect(d.budget.tickets).toEqual([{ id: 1, lane: "group", worstUsd: expect.closeTo(worstByHand(params, model, 2_500), 12), model }]);
  });

  it.each(LARGER)("gives each request on %s min(40 s, what's left of 60 s)", async (model) => {
    const clock = { now: NOW };
    const client = fakeClaude([timed(clock, 25_000, ok(toolTurn(figuresUse()))), timed(clock, 20_000, failure("server")), timed(clock, 5_000, ok(endTurn()))]);
    expect((await answerQuestion(request(), deps(client, { model, now: () => clock.now }))).kind).toBe("answer");
    expect(client.calls.map((c) => c.timeoutMs)).toEqual([40_000, 35_000, 15_000]);
  });

  it.each(LARGER)("sends nothing on %s once less than 10 seconds of its 60 are left (model#2)", async (model) => {
    const clock = { now: NOW };
    const client = fakeClaude([timed(clock, 50_500, ok(toolTurn(figuresUse()))), ok(endTurn())]);
    const d = deps(client, { model, now: () => clock.now });
    expect(await answerQuestion(request(), d)).toEqual({ kind: "unavailable", reason: "timeout" });
    expect(client.calls).toHaveLength(1);
    expect(d.budget.tickets).toHaveLength(1);
  });

  it.each(LARGER)("retries on %s only when its wait and 10 more seconds still fit before the deadline (model#2)", async (model) => {
    const clock = { now: NOW };
    const fits = fakeClaude([timed(clock, 49_000, failure("overloaded", 529, 1)), ok(endTurn())]);
    expect((await answerQuestion(request(), deps(fits, { model, now: () => clock.now }))).kind).toBe("answer");
    expect(fits.calls.map((c) => c.timeoutMs)).toEqual([40_000, 11_000]);
    clock.now = NOW;
    const late = fakeClaude([timed(clock, 51_000, failure("overloaded", 529, 1)), ok(endTurn())]);
    const d = deps(late, { model, now: () => clock.now });
    expect(await answerQuestion(request(), d)).toEqual({ kind: "unavailable", reason: "error" });
    expect(late.calls).toHaveLength(1);
    expect(d.budget.failures).toEqual(["overloaded"]);
  });

  it("gives up on a call to Sonnet 5.5 that never ends a little past its 40 seconds, as a timeout, and sends no second", async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const stalled: ClaudeClient = { create: () => (calls.push(Date.now()), new Promise(() => undefined)), countTokens: async () => null };
    const d = deps(stalled, { model: "claude-sonnet-5-5", now: () => Date.now() });
    const pending = answerQuestion(request(), d);
    await vi.advanceTimersByTimeAsync(40_000 + GRACE_MS - 1);
    expect(d.budget.settled).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ kind: "unavailable", reason: "timeout" });
    expect(d.budget.settled).toEqual([{ ticket: d.budget.tickets[0], usage: null, failure: "timeout" }]);
    expect(calls).toHaveLength(1);
  });
});

/** The bot's own ledger (claude/budget.ts) at a $3 cap, on the tests' fixed clock. */
const ledger = () => createBudget({ capUsd: 3, saved: null, off: null, save: () => undefined, saveOff: () => undefined, onEvent: () => undefined, now: () => NOW });
const network: ClaudeOutcome = { ok: false, failure: "network", type: null, status: null, retryAfterMs: 1 };

describe("answerQuestion's charges on each model", () => {
  it.each(["claude-haiku-5-5", ...LARGER] as const)("charges a reply on %s at its prices", async (model) => {
    const reply = endTurn();
    const budget = ledger();
    expect((await answerQuestion(request(), { ...deps(fakeClaude([ok(reply)]), { model }), budget })).kind).toBe("answer");
    expect(budget.status(NOW).lanes.group.spentUsd).toBeCloseTo(costOf(reply.usage, model), 12);
  });

  it.each(LARGER)("keeps the reservations of requests on %s that may have been billed, priced on that model", async (model) => {
    const client = fakeClaude([network, network]);
    const budget = ledger();
    expect(await answerQuestion(request(), { ...deps(client, { model }), budget })).toEqual({ kind: "unavailable", reason: "error" });
    const worst = client.calls.reduce((usd, call) => usd + worstByHand(call.params, model, ANSWER_SETTINGS[model].maxTokens), 0);
    expect(budget.status(NOW).spentUsd).toBeCloseTo(worst, 9);
  });
});

describe("typing while an answer is written", () => {
  it("runs past each model's deadline: 12 beats (48 s) for Haiku's 45 s, 16 (64 s) for Sonnet's and Opus's 60 s", () => {
    expect(typingBeats(ANSWER_SETTINGS["claude-haiku-5-5"].deadlineMs)).toBe(TYPING_MAX_BEATS);
    for (const model of LARGER) expect(typingBeats(ANSWER_SETTINGS[model].deadlineMs)).toBe(16);
    for (const model of ["claude-haiku-5-5", ...LARGER] as const) {
      const { deadlineMs } = ANSWER_SETTINGS[model];
      // The last beat shows "typing…" for 5 more seconds: past the deadline and the last request's grace.
      expect((typingBeats(deadlineMs) - 1) * TYPING_EVERY_MS + 5_000).toBeGreaterThan(deadlineMs + GRACE_MS);
    }
    expect(typingBeats(Number.NaN)).toBe(TYPING_MAX_BEATS);
  });
});
