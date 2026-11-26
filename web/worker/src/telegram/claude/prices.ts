import type { ClaudeModel, Usage } from "./types";

/** Dollars per million tokens. */
export interface PriceTable {
  input: number;
  /** A 5-minute cache write. */
  write5m: number;
  /** A 1-hour cache write. */
  write1h: number;
  /** A cache read. */
  read: number;
  output: number;
}

/** A model's prices: one table at any prompt length, or one plus a dearer table past a prompt size. */
export interface RateCard {
  readonly card: PriceTable;
  /** The table for a prompt (input, cache reads and cache writes counted together) past `aboveTokens`; null for one table at any length. */
  readonly long: { readonly aboveTokens: number; readonly card: PriceTable } | null;
}

/**
 * Each model's rate card (platform.claude.com pricing, read 25 Nov 2026).
 * Claude Haiku 5.5 has two: its long card applies once a prompt passes
 * 100,000 tokens. Claude Sonnet 5.5 and Claude Opus 5.5 have one card at
 * any prompt length.
 */
export const PRICES: Readonly<Record<ClaudeModel, RateCard>> = Object.freeze({
  "claude-haiku-5-5": Object.freeze({
    card: Object.freeze({ input: 0.1, write5m: 0.125, write1h: 0.2, read: 0.01, output: 0.5 }),
    long: Object.freeze({ aboveTokens: 100_000, card: Object.freeze({ input: 0.5, write5m: 0.625, write1h: 1, read: 0.05, output: 2.5 }) }),
  }),
  "claude-sonnet-5-5": Object.freeze({ card: Object.freeze({ input: 2, write5m: 2.5, write1h: 4, read: 0.1, output: 10 }), long: null }),
  "claude-opus-5-5": Object.freeze({ card: Object.freeze({ input: 4, write5m: 5, write1h: 8, read: 0.2, output: 20 }), long: null }),
});

/** A request longer than this is never sent. */
export const MAX_REQUEST_CHARS = 80_000;

/**
 * The characters per token a reservation assumes (model#3): fewer than the
 * request's own run (the English pack and its JSON, and short questions), so
 * the estimate is an upper bound, without counting every character as a
 * token, which reserved far more than a request can cost at Sonnet's and
 * Opus's prices.
 */
export const CHARS_PER_TOKEN = 2;

/**
 * The system prompt the API adds to a request with tools (`tool_choice`
 * auto): 286 tokens on Haiku 5.5, Sonnet 5.5 and Opus 5.5 (the pricing
 * page). It isn't in the request's characters, so an answer's reservation
 * adds it; a check sends no tools.
 */
export const TOOL_PROMPT_TOKENS = 286;

const MILLION = 1_000_000;

/** A token count as the API gave it, or 0 when it is missing or malformed. */
const tokens = (n: number | null | undefined): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/** The table a prompt of this many tokens is priced on, by model; null for a model without a card here (such a request is never sent). */
export function cardFor(model: ClaudeModel, promptTokens: number): PriceTable | null {
  const rates: RateCard | undefined = Object.hasOwn(PRICES, model) ? PRICES[model] : undefined;
  if (!rates) return null;
  return rates.long && promptTokens > rates.long.aboveTokens ? rates.long.card : rates.card;
}

/**
 * A request's real cost in dollars on `model`, from the usage the API
 * returned: input, 5-minute and 1-hour cache writes, cache reads and output,
 * on the card the prompt's size selects. Cache writes come from the usage's
 * breakdown by TTL; any the breakdown leaves out (or all of them, without
 * one) are charged at the dearer 1-hour rate. NaN for a model without a card.
 */
export function costOf(usage: Usage, model: ClaudeModel): number {
  const input = tokens(usage.input_tokens);
  const read = tokens(usage.cache_read_input_tokens);
  const write5m = tokens(usage.cache_creation?.ephemeral_5m_input_tokens);
  const write1h = tokens(usage.cache_creation?.ephemeral_1h_input_tokens);
  const writes = Math.max(tokens(usage.cache_creation_input_tokens), write5m + write1h);
  const card = cardFor(model, input + read + writes);
  if (!card) return Number.NaN;
  const dollars =
    input * card.input + read * card.read + write5m * card.write5m + (writes - write5m) * card.write1h + tokens(usage.output_tokens) * card.output;
  return dollars / MILLION;
}

/**
 * The most one request on `model` can cost, which the budget reserves before
 * sending it: its characters as tokens (one per 2 characters, rounded up)
 * plus `toolTokens` (TOOL_PROMPT_TOKENS for a request with tools, an
 * answer's; 0 for a check), all written to the 1-hour cache, the dearest way
 * a prompt token is billed, on the card that count selects, plus max_tokens
 * of output (thinking included) at that card's output price. NaN for a model
 * without a card, which the budget refuses.
 */
export function worstCaseUsd(requestChars: number, maxTokens: number, model: ClaudeModel, toolTokens = 0): number {
  const estimated = Math.ceil(tokens(requestChars) / CHARS_PER_TOKEN) + Math.ceil(tokens(toolTokens));
  const card = cardFor(model, estimated);
  if (!card) return Number.NaN;
  return (estimated * card.write1h + tokens(maxTokens) * card.output) / MILLION;
}
