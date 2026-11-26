import type Anthropic from "@anthropic-ai/sdk";
import { MAX_REQUEST_CHARS, TOOL_PROMPT_TOKENS, worstCaseUsd } from "../claude/prices";
import type { AnswerModel, Budget, ClaudeClient, ClaudeFailure, ClaudeOutcome, ClaudeRequest, Lane } from "../claude/types";
import { ANSWER_SCHEMA } from "./schema";
import { ANSWER_TOOLS } from "./tools";

/**
 * One request of the answer loop (agent/answer.ts): its parameters, the
 * reservation of its worst case, the call with its timeout, and the charge
 * of its real cost. Effort and thinking stay fixed per model, since a change
 * would invalidate the cache; thinking is left out, so it stays on (adaptive
 * by default on Haiku 5.5, Sonnet 5.5 and Opus 5.5; JSON output with tools
 * needs it on).
 */

/** One answer's settings on one model (prompts/15-community-agent.md, Request settings). */
export interface AnswerSettings {
  readonly maxTokens: number;
  readonly effort: "high" | "medium";
  /** Each request's own timeout, at most what's left of the deadline. */
  readonly requestTimeoutMs: number;
  /** The whole answer, its tool round and retry included; the answers' queue waits as long before it drops one. */
  readonly deadlineMs: number;
  /** The send floor: no request is sent with less of the deadline left than this (it could only time out, and still be charged), and a retry needs its wait plus this. */
  readonly minRequestMs: number;
  readonly maxRequests: 3;
}

/**
 * Fixed per model: Haiku 5.5 at effort high with 8,000 tokens, 20 seconds a
 * request, 45 in all and a 3-second send floor; Sonnet 5.5 and Opus 5.5 at
 * medium, which keeps their thinking, latency and cost down for short chat
 * answers, with 2,500 tokens, 40 seconds a request, 60 in all and a
 * 10-second floor, so a request has time to write what max_tokens allows
 * before its timeout (model#2).
 */
export const ANSWER_SETTINGS: Readonly<Record<AnswerModel, AnswerSettings>> = Object.freeze({
  "claude-haiku-5-5": Object.freeze({ maxTokens: 8000, effort: "high", requestTimeoutMs: 20_000, deadlineMs: 45_000, minRequestMs: 3_000, maxRequests: 3 } as const),
  "claude-sonnet-5-5": Object.freeze({ maxTokens: 2500, effort: "medium", requestTimeoutMs: 40_000, deadlineMs: 60_000, minRequestMs: 10_000, maxRequests: 3 } as const),
  "claude-opus-5-5": Object.freeze({ maxTokens: 2500, effort: "medium", requestTimeoutMs: 40_000, deadlineMs: 60_000, minRequestMs: 10_000, maxRequests: 3 } as const),
});

/** Before a retry the API gave no retry-after for. */
const BACKOFF_MS = 500;
/** Past a request's own timeout, the hard stop: the SDK's timer ends once the reply's headers arrive, so a stalled body must never hold an answer. */
export const GRACE_MS = 2_000;
/**
 * Failures worth one more try: the request may well succeed a moment later.
 * Never a timeout: the same request at the same effort and max_tokens would
 * most likely run as long again, and be charged twice.
 */
const RETRYABLE: readonly ClaudeFailure[] = ["network", "overloaded", "server", "rate_limited"];
/** The pseudonymous code's shape (claude/user-code.ts): nothing else, such as a raw ID, is ever sent as metadata.user_id. */
const USER_CODE = /^[0-9a-f]{32}$/;

/** The request on `model`, at its settings: no thinking field, sampling parameters, tool_choice, prefill or fallbacks. */
export function answerParams(
  system: Anthropic.TextBlockParam[],
  messages: readonly Anthropic.MessageParam[],
  userCode: string | null,
  model: AnswerModel,
): Anthropic.MessageCreateParamsNonStreaming {
  const settings = ANSWER_SETTINGS[model];
  return {
    model,
    max_tokens: settings.maxTokens,
    output_config: { effort: settings.effort, format: { type: "json_schema", schema: ANSWER_SCHEMA } },
    tools: ANSWER_TOOLS,
    system,
    messages: [...messages],
    ...(typeof userCode === "string" && USER_CODE.test(userCode) ? { metadata: { user_id: userCode } } : {}),
  };
}

const failure = (kind: ClaudeFailure): ClaudeOutcome => ({ ok: false, failure: kind, type: null, status: null, retryAfterMs: null });

/** Runs a callback the loop doesn't own (the budget's): its trouble never changes the answer. */
export function quietly(run: () => void): void {
  try {
    run();
  } catch {
    // The ledger keeps its own state; the answer goes on.
  }
}

/** One call, given up as a timeout a little past its own timeout. The client never rejects; one that does counts as an unknown failure. */
async function send(client: ClaudeClient, request: ClaudeRequest): Promise<ClaudeOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<ClaudeOutcome>((resolve) => {
    timer = setTimeout(() => resolve(failure("timeout")), request.timeoutMs + GRACE_MS);
  });
  try {
    return await Promise.race([client.create(request), late]);
  } catch {
    return failure("unknown");
  } finally {
    clearTimeout(timer);
  }
}

export type Attempt = { kind: "sent"; outcome: ClaudeOutcome } | { kind: "too_long" | "budget" | "late" };

export interface AttemptDeps {
  client: ClaudeClient;
  budget: Budget;
  now: () => number;
  /** The model answers run on: its settings, and the prices its requests are reserved and charged at. */
  model: AnswerModel;
}

/**
 * One request: never sent when it would pass 80,000 characters, when less
 * of the deadline is left than its model's send floor (10 seconds on Sonnet
 * 5.5 and Opus 5.5, 3 on Haiku 5.5), or when the lane or the day can't take
 * its worst case on its model, the tool prompt included. Otherwise it runs
 * with min(its model's request timeout, what's left) and is settled
 * whatever happens: charged from usage at its model's prices, or by its
 * failure and the failure's type (claude/budget.ts keeps a timeout's
 * reservation, releases one the API answered and one that never left the
 * worker).
 */
export async function attempt(params: Anthropic.MessageCreateParamsNonStreaming, lane: Lane, deadline: number, deps: AttemptDeps): Promise<Attempt> {
  const settings = ANSWER_SETTINGS[deps.model];
  const chars = JSON.stringify(params).length;
  if (chars > MAX_REQUEST_CHARS) return { kind: "too_long" };
  const left = Math.floor(deadline - deps.now());
  if (!(left >= settings.minRequestMs)) return { kind: "late" };
  const ticket = deps.budget.reserve(lane, worstCaseUsd(chars, settings.maxTokens, deps.model, TOOL_PROMPT_TOKENS), deps.now(), deps.model);
  if (!ticket) return { kind: "budget" };
  let outcome = failure("unknown");
  try {
    outcome = await send(deps.client, { kind: "answer", lane, params, timeoutMs: Math.min(settings.requestTimeoutMs, left) });
  } finally {
    const settled = outcome;
    quietly(() => deps.budget.commit(ticket, settled.ok ? settled.message.usage : null, settled.ok ? null : settled.failure, deps.now(), settled.ok ? null : settled.type));
  }
  return { kind: "sent", outcome };
}

/**
 * How long to wait before the one retry, or null for none: a network
 * failure, overload, server error or rate limit (never a timeout), waiting
 * what the API asked (retry-after), and only when the retry still has its
 * model's send floor (`minRequestMs`) before the deadline.
 */
export function retryWait(outcome: Extract<ClaudeOutcome, { ok: false }>, now: number, deadline: number, minRequestMs: number): number | null {
  if (!RETRYABLE.includes(outcome.failure)) return null;
  const wait = outcome.retryAfterMs ?? BACKOFF_MS;
  if (!Number.isFinite(wait) || wait < 0) return null;
  return now + wait + minRequestMs <= deadline ? wait : null;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
