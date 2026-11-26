import { costOf } from "../../src/telegram/claude/prices";
import { type CallKind, type ClaudeClient, type ClaudeFailure, type ClaudeRequest, isClaudeModel, type Lane, type Usage } from "../../src/telegram/claude/types";

/**
 * The eval's view of each model call (run.ts): a client wrapper that
 * records what every request cost and how long it took, the sums of those
 * records, percentiles and a small worker pool. Nothing here is kept after
 * the run.
 */

export type Effort = "low" | "medium" | "high";

export interface CallRecord {
  kind: CallKind;
  lane: Lane;
  /** The model the request named: its usage is priced on that model's card. */
  model: string;
  ms: number;
  /** The reply's stop reason, or null for a failure. */
  stop: string | null;
  failure: ClaudeFailure | null;
  usage: Usage | null;
}

/** The same request at another effort: the eval's comparison runs only (the bot's answers always run at their model's own). */
function atEffort(request: ClaudeRequest, effort: Effort): ClaudeRequest {
  return { ...request, params: { ...request.params, output_config: { ...request.params.output_config, effort } } };
}

/** A client that records each call, and with `effort` sends every answer request at that effort instead. */
export function metered(inner: ClaudeClient, effort: Effort | null = null): ClaudeClient & { calls: CallRecord[] } {
  const calls: CallRecord[] = [];
  return {
    calls,
    async create(request) {
      const started = Date.now();
      const record = (stop: string | null, failure: ClaudeFailure | null, usage: Usage | null) =>
        calls.push({ kind: request.kind, lane: request.lane, model: request.params.model, ms: Date.now() - started, stop, failure, usage });
      try {
        const outcome = await inner.create(effort && request.kind === "answer" ? atEffort(request, effort) : request);
        if (outcome.ok) record(outcome.message.stop_reason ?? null, null, outcome.message.usage);
        else record(null, outcome.failure, null);
        return outcome;
      } catch (error) {
        record(null, "unknown", null);
        throw error;
      }
    },
    countTokens: (params) => inner.countTokens(params),
  };
}

export interface Totals {
  requests: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  thinking: number;
  /** From usage, each call on its own model's rate card (claude/prices.ts). */
  usd: number;
  refusals: number;
  failures: number;
}

const tokens = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

export function totals(calls: readonly CallRecord[]): Totals {
  const sum: Totals = { requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, thinking: 0, usd: 0, refusals: 0, failures: 0 };
  for (const call of calls) {
    sum.requests += 1;
    if (call.failure) sum.failures += 1;
    if (call.stop === "refusal") sum.refusals += 1;
    const u = call.usage;
    if (!u) continue;
    sum.input += tokens(u.input_tokens);
    sum.cacheRead += tokens(u.cache_read_input_tokens);
    sum.cacheWrite += tokens(u.cache_creation_input_tokens);
    sum.output += tokens(u.output_tokens);
    sum.thinking += tokens(u.output_tokens_details?.thinking_tokens);
    const usd = isClaudeModel(call.model) ? costOf(u, call.model) : Number.NaN;
    sum.usd += Number.isFinite(usd) ? usd : 0;
  }
  return sum;
}

/** The nearest-rank percentile, or null without values. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/**
 * Runs `run` over the items, `size` at a time, results in the items' order.
 * The first item runs alone, so its reply has written the prompt cache
 * before the others read it.
 */
export async function pool<T, R>(items: readonly T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = [await run(items[0])];
  let next = 1;
  const worker = async () => {
    while (next < items.length) {
      const at = next;
      next += 1;
      out[at] = await run(items[at]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length - 1) }, worker));
  return out;
}
