// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type BudgetEvent, createBudget } from "../src/telegram/claude/budget";
import { createClaudeClient } from "../src/telegram/claude/client";
import { ANSWER_SETTINGS } from "../src/telegram/agent/answer-request";
import { TOOL_PROMPT_TOKENS, worstCaseUsd } from "../src/telegram/claude/prices";
import { type Budget, type ClaudeRequest, DEFAULT_ANSWER_MODEL, TRIAGE_MODEL } from "../src/telegram/claude/types";
import { costing } from "./claude-budget-fixtures";

/**
 * How a request's outcome settles in the budget when its caller passes on
 * what it knows: the lane of a final failure (a ramp limit makes only that
 * kind of call wait) and the client's type (a connection that never reached
 * Anthropic is released). Requests through the real client go to a fake
 * fetch: nothing reaches the network.
 */

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
/** Worst cases with requests of the real size: a check of some 17,000 characters on Haiku 5.5, and one answer attempt of some 51,500 on Sonnet 5.5, the bot's default, with its tool prompt. */
const CHECK_WORST = worstCaseUsd(17_000, 400, TRIAGE_MODEL);
const ANSWER_WORST = worstCaseUsd(51_500, ANSWER_SETTINGS[DEFAULT_ANSWER_MODEL].maxTokens, DEFAULT_ANSWER_MODEL, TOOL_PROMPT_TOKENS);
/** The group lane's cap on the $3 day: 45%. */
const GROUP_CAP = 1.35;
const modelOf = (lane: "triage" | "group") => (lane === "triage" ? TRIAGE_MODEL : DEFAULT_ANSWER_MODEL);

function harness() {
  const events: BudgetEvent[] = [];
  /** Each event with the kind of call it is about ("-" for every call). */
  const told: string[] = [];
  const onEvent = (event: BudgetEvent, _status: unknown, _lane: unknown, kind: string | null) => {
    events.push(event);
    told.push(`${event}:${kind ?? "-"}`);
  };
  const budget = createBudget({ capUsd: 3, saved: null, off: null, save: () => undefined, saveOff: () => undefined, onEvent, now: () => T0 });
  return { budget, events, told };
}

const open = (budget: Budget, now: number) => ({ checks: budget.available("triage", now), answers: budget.available("group", now) && budget.available("private", now) });

describe("a ramp limit waits in the kind of call that hit it (claude#1)", () => {
  it("makes answers wait after an answer's, and checks after a check's", () => {
    const fromAnswer = harness().budget;
    fromAnswer.failed("ramp", 30_000, T0, "private");
    expect(open(fromAnswer, T0 + 29_999)).toEqual({ checks: true, answers: false });
    expect(fromAnswer.status(T0 + 1)).toMatchObject({ on: false, reason: "ramp", until: T0 + 30_000 });
    expect(open(fromAnswer, T0 + 30_000)).toEqual({ checks: true, answers: true });

    const fromCheck = harness().budget;
    fromCheck.failed("ramp", null, T0, "triage");
    expect(open(fromCheck, T0 + 9_999)).toEqual({ checks: false, answers: true });
    expect(open(fromCheck, T0 + 10_000)).toEqual({ checks: true, answers: true });
  });

  it("says until the later wait while both wait, without an alert, and makes every call wait when no lane is given", () => {
    const { budget, events } = harness();
    budget.failed("ramp", 20_000, T0, "group");
    budget.failed("ramp", 5_000, T0 + 1_000, "triage");
    expect(budget.status(T0 + 2_000)).toMatchObject({ on: false, reason: "ramp", until: T0 + 20_000 });
    expect(open(budget, T0 + 6_000)).toEqual({ checks: true, answers: false });
    expect(events).toEqual([]);

    const unknown = harness().budget;
    unknown.failed("ramp", 4_000, T0);
    expect(open(unknown, T0 + 3_999)).toEqual({ checks: false, answers: false });
    expect(open(unknown, T0 + 4_000)).toEqual({ checks: true, answers: true });
  });
});

/** A fetch that fails as undici's does when the connection fails: "fetch failed", with the system's error as its cause. */
const failingFetch = (code: string) => async () => Promise.reject(new TypeError("fetch failed", { cause: Object.assign(new Error(`connect ${code}`), { code }) }));

const request: ClaudeRequest = { kind: "answer", lane: "group", params: { model: DEFAULT_ANSWER_MODEL, max_tokens: 100, messages: [{ role: "user", content: "QUESTION" }] }, timeoutMs: 5_000 };

/**
 * Hours of connections failing, as the bot sends them: every 20 seconds a
 * check (its failure reported, then its ticket settled) and an answer
 * attempt (settled, then its failure reported), each with the client's type.
 */
function outage(budget: Budget, type: string | null, from: number, to: number): void {
  for (let at = from; at < to; at += 20_000) {
    const check = budget.reserve("triage", CHECK_WORST, at, TRIAGE_MODEL);
    if (check) {
      budget.failed("network", null, at, "triage");
      budget.commit(check, null, "network", at, type);
    }
    const answer = budget.reserve("group", ANSWER_WORST, at, DEFAULT_ANSWER_MODEL);
    if (answer) {
      budget.commit(answer, null, "network", at, type);
      budget.failed("network", null, at, "group");
    }
  }
}

describe("a connection that never reached Anthropic (claude#3)", () => {
  it.each([
    ["ENOTFOUND", 0],
    ["EAI_AGAIN", 0],
    ["ECONNREFUSED", 0],
    ["CERT_HAS_EXPIRED", 0],
    ["ECONNRESET", ANSWER_WORST],
  ] as const)("settles a request whose connection failed with %s at %s USD, through the real client", async (code, charged) => {
    const client = createClaudeClient({ apiKey: "sk-ant-api03-test-key", log: () => undefined, fetch: failingFetch(code) });
    const { budget } = harness();
    const ticket = budget.reserve("group", ANSWER_WORST, T0, DEFAULT_ANSWER_MODEL);
    const outcome = await client.create(request);
    expect(ticket).not.toBeNull();
    expect(outcome).toMatchObject({ ok: false, failure: "network" });
    if (outcome.ok || !ticket) return;
    expect(budget.commit(ticket, null, outcome.failure, T0, outcome.type)).toBe(charged);
  });

  it("charges nothing for 3 hours of DNS failures, though each kind still pauses, so every lane is open when the network returns", () => {
    const { budget, told } = harness();
    outage(budget, "unsent", T0, T0 + 3 * HOUR);
    expect(budget.status(T0 + 3 * HOUR).spentUsd).toBe(0);
    expect(budget.status(T0 + 3 * HOUR).lanes.group.calls).toBeGreaterThan(60);
    // Each kind's pause is said once, on its own (answers#13).
    expect(told).toEqual(["circuit:triage", "circuit:answer"]);
    const back = T0 + 3 * HOUR + 10 * MIN;
    expect(open(budget, back)).toEqual({ checks: true, answers: true });
    for (const lane of ["triage", "group"] as const) budget.commit(budget.reserve(lane, ANSWER_WORST, back, modelOf(lane))!, costing(0.001), null, back);
    expect(told).toEqual(["circuit:triage", "circuit:answer", "restored:triage", "restored:-"]);
  });

  it("still charges connections that may have reached Anthropic: the same hours of resets fill the group lane until no answer fits", () => {
    const { budget, events } = harness();
    outage(budget, null, T0, T0 + 3 * HOUR);
    const back = T0 + 3 * HOUR + 10 * MIN;
    expect(budget.status(back).lanes.group.spentUsd).toBeGreaterThan(GROUP_CAP - ANSWER_WORST);
    expect(budget.status(back).lanes.group.spentUsd).toBeLessThanOrEqual(GROUP_CAP);
    expect(budget.reserve("group", ANSWER_WORST, back, DEFAULT_ANSWER_MODEL)).toBeNull();
    // Refused, not closed (model#1): the lane closes, with its alert, only if its spending reaches the cap.
    expect(events).toEqual(["circuit", "circuit"]);
  });
});
