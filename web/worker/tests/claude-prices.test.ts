import { describe, expect, it } from "vitest";
import { cardFor, CHARS_PER_TOKEN, costOf, MAX_REQUEST_CHARS, PRICES, TOOL_PROMPT_TOKENS, worstCaseUsd } from "../src/telegram/claude/prices";
import { ANSWER_MODELS, type ClaudeModel, type Usage } from "../src/telegram/claude/types";

/** Usage as the API returns it, every count 0 unless given. */
const usage = (u: Partial<Usage>): Usage => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_creation: null,
  inference_geo: null,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: "standard",
  speed: null,
  ...u,
});

/** A millionth of a cent, in dollars. */
const MILLIONTH_CENT = 1e-8;
const close = (usd: number, millionths: number) => expect(Math.abs(usd - millionths / 1e6)).toBeLessThan(MILLIONTH_CENT);
const HAIKU: ClaudeModel = "claude-haiku-5-5";
const SONNET: ClaudeModel = "claude-sonnet-5-5";
const OPUS: ClaudeModel = "claude-opus-5-5";
/** An answer's request with 1-hour and 5-minute cache writes in its breakdown. */
const TYPICAL = usage({
  input_tokens: 1_300,
  cache_read_input_tokens: 17_500,
  cache_creation_input_tokens: 2_000,
  cache_creation: { ephemeral_1h_input_tokens: 1_500, ephemeral_5m_input_tokens: 500 },
  output_tokens: 900,
});

describe("the rate cards", () => {
  it("are the pricing page's, per million tokens: Haiku 5.5 with its step at 100,000 prompt tokens, Sonnet 5.5 and Opus 5.5 with one card", () => {
    expect(PRICES).toEqual({
      "claude-haiku-5-5": {
        card: { input: 0.1, write5m: 0.125, write1h: 0.2, read: 0.01, output: 0.5 },
        long: { aboveTokens: 100_000, card: { input: 0.5, write5m: 0.625, write1h: 1, read: 0.05, output: 2.5 } },
      },
      "claude-sonnet-5-5": { card: { input: 2, write5m: 2.5, write1h: 4, read: 0.1, output: 10 }, long: null },
      "claude-opus-5-5": { card: { input: 4, write5m: 5, write1h: 8, read: 0.2, output: 20 }, long: null },
    });
    expect(Object.isFrozen(PRICES)).toBe(true);
    // Every model answers may run on has a card, the checks' Haiku 5.5 among them.
    expect(ANSWER_MODELS.filter((m) => cardFor(m, 0) === null)).toEqual([]);
    expect(MAX_REQUEST_CHARS).toBe(80_000);
  });

  it("has no card for a model the bot doesn't call", () => {
    const other = "claude-opus-4-8" as ClaudeModel;
    expect(cardFor(other, 0)).toBeNull();
    expect(costOf(TYPICAL, other)).toBeNaN();
    expect(worstCaseUsd(10_000, 400, other)).toBeNaN();
  });
});

describe("costOf", () => {
  it("charges input, cache reads, both cache writes and output on Haiku 5.5's card, to the millionth of a cent", () => {
    // 1,300 × 0.10 + 17,500 × 0.01 + 500 × 0.125 + 1,500 × 0.20 + 900 × 0.50 = 1,117.5 millionths of a dollar.
    close(costOf(TYPICAL, HAIKU), 1_117.5);
  });

  it("charges the same request on Sonnet 5.5's and Opus 5.5's cards", () => {
    // 1,300 × 2 + 17,500 × 0.10 + 500 × 2.50 + 1,500 × 4 + 900 × 10 = 20,600 millionths.
    close(costOf(TYPICAL, SONNET), 20_600);
    // 1,300 × 4 + 17,500 × 0.20 + 500 × 5 + 1,500 × 8 + 900 × 20 = 41,200 millionths.
    close(costOf(TYPICAL, OPUS), 41_200);
  });

  it("charges cache writes without a breakdown at each model's 1-hour rate", () => {
    const u = usage({ input_tokens: 100, cache_creation_input_tokens: 10_000, output_tokens: 50 });
    // 100 × 0.10 + 10,000 × 0.20 + 50 × 0.50 = 2,035 millionths; on Sonnet 100 × 2 + 10,000 × 4 + 50 × 10; on Opus twice that.
    close(costOf(u, HAIKU), 2_035);
    close(costOf(u, SONNET), 40_700);
    close(costOf(u, OPUS), 81_400);
  });

  it("charges an answer's typical request at about a thousandth of a dollar on Haiku 5.5, under two cents on Sonnet 5.5 and twice that on Opus 5.5", () => {
    const u = usage({ input_tokens: 1_300, cache_read_input_tokens: 17_500, output_tokens: 1_000 });
    expect(costOf(u, HAIKU)).toBeGreaterThan(0.0005);
    expect(costOf(u, HAIKU)).toBeLessThan(0.0015);
    close(costOf(u, SONNET), 1_300 * 2 + 17_500 * 0.1 + 1_000 * 10);
    expect(costOf(u, OPUS)).toBeCloseTo(2 * costOf(u, SONNET), 12);
  });

  it("moves Haiku 5.5 to its long card once input, cache reads and cache writes together pass 100,000 tokens; Sonnet and Opus keep theirs", () => {
    const at = usage({ input_tokens: 1_000, cache_read_input_tokens: 98_000, cache_creation_input_tokens: 1_000, output_tokens: 1_000 });
    // Exactly 100,000: still the short card.
    close(costOf(at, HAIKU), 1_000 * 0.1 + 98_000 * 0.01 + 1_000 * 0.2 + 1_000 * 0.5);
    const over = usage({ input_tokens: 1_001, cache_read_input_tokens: 98_000, cache_creation_input_tokens: 1_000, output_tokens: 1_000 });
    close(costOf(over, HAIKU), 1_001 * 0.5 + 98_000 * 0.05 + 1_000 * 1 + 1_000 * 2.5);
    close(costOf(over, SONNET), 1_001 * 2 + 98_000 * 0.1 + 1_000 * 4 + 1_000 * 10);
    close(costOf(over, OPUS), 1_001 * 4 + 98_000 * 0.2 + 1_000 * 8 + 1_000 * 20);
  });

  it("counts a missing or broken count as nothing, on every card", () => {
    for (const model of ANSWER_MODELS) {
      expect(costOf(usage({ cache_read_input_tokens: null, cache_creation_input_tokens: null }), model)).toBe(0);
      expect(costOf(usage({ input_tokens: Number.NaN, output_tokens: -5 }), model)).toBe(0);
    }
  });
});

describe("worstCaseUsd", () => {
  it("counts a request's characters as tokens, one per 2 rounded up, plus the 286 tokens of the tool prompt for a request with tools (model#3)", () => {
    expect(CHARS_PER_TOKEN).toBe(2);
    expect(TOOL_PROMPT_TOKENS).toBe(286);
    // An answer at the 80,000-character limit: 40,000 tokens and the tool prompt's 286, written to the 1-hour cache, plus max_tokens out.
    close(worstCaseUsd(80_000, 8_000, HAIKU, TOOL_PROMPT_TOKENS), 40_286 * 0.2 + 8_000 * 0.5);
    close(worstCaseUsd(80_000, 2_500, SONNET, TOOL_PROMPT_TOKENS), 40_286 * 4 + 2_500 * 10);
    close(worstCaseUsd(80_000, 2_500, OPUS, TOOL_PROMPT_TOKENS), 40_286 * 8 + 2_500 * 20);
    // A check on Haiku 5.5 sends no tools: 12,000 characters are 6,000 tokens, and 400 out.
    close(worstCaseUsd(12_000, 400, HAIKU), 6_000 * 0.2 + 400 * 0.5);
    // 51,481 characters are 25,740.5 tokens: 25,741 are reserved.
    close(worstCaseUsd(51_481, 0, SONNET), 25_741 * 4);
  });

  it("reserves an answer of the real size (some 51,500 characters) at about $0.009 on Haiku 5.5, $0.13 on Sonnet 5.5 and $0.26 on Opus 5.5", () => {
    expect(worstCaseUsd(51_500, 8_000, HAIKU, TOOL_PROMPT_TOKENS)).toBeCloseTo(0.0092, 4);
    expect(worstCaseUsd(51_500, 2_500, SONNET, TOOL_PROMPT_TOKENS)).toBeCloseTo(0.1291, 4);
    expect(worstCaseUsd(51_500, 2_500, OPUS, TOOL_PROMPT_TOKENS)).toBeCloseTo(0.2583, 4);
  });

  it("uses Haiku 5.5's long card once the estimated tokens, the tool prompt's included, pass 100,000; one card on Sonnet and Opus", () => {
    close(worstCaseUsd(200_000, 8_000, HAIKU), 100_000 * 0.2 + 8_000 * 0.5);
    close(worstCaseUsd(200_001, 8_000, HAIKU), 100_001 * 1 + 8_000 * 2.5);
    close(worstCaseUsd(199_428, 8_000, HAIKU, TOOL_PROMPT_TOKENS), 100_000 * 0.2 + 8_000 * 0.5);
    close(worstCaseUsd(199_430, 8_000, HAIKU, TOOL_PROMPT_TOKENS), 100_001 * 1 + 8_000 * 2.5);
    close(worstCaseUsd(300_000, 2_500, SONNET), 150_000 * 4 + 2_500 * 10);
    close(worstCaseUsd(300_000, 2_500, OPUS), 150_000 * 8 + 2_500 * 20);
  });

  it("is a real upper bound: never below the real cost of a request within its estimate, however its prompt splits into input, cache reads and writes (model#3)", () => {
    const chars = 51_500;
    const prompt = Math.ceil(chars / CHARS_PER_TOKEN) + TOOL_PROMPT_TOKENS;
    for (const [model, maxTokens] of [[HAIKU, 8_000], [SONNET, 2_500], [OPUS, 2_500]] as const) {
      const worst = worstCaseUsd(chars, maxTokens, model, TOOL_PROMPT_TOKENS);
      for (const [input, read, write5m] of [[prompt, 0, 0], [0, prompt, 0], [0, 0, prompt], [1_300, 17_500, 0], [500, prompt - 2_000, 1_500]]) {
        const written = prompt - input - read;
        const u = usage({ input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: written, cache_creation: { ephemeral_5m_input_tokens: write5m, ephemeral_1h_input_tokens: written - write5m }, output_tokens: maxTokens });
        expect(costOf(u, model), `${model} ${input}/${read}/${write5m}`).toBeLessThanOrEqual(worst + 1e-12);
      }
      // Writing the whole prompt to the 1-hour cache and using all of max_tokens is the worst case itself.
      expect(costOf(usage({ cache_creation_input_tokens: prompt, output_tokens: maxTokens }), model)).toBeCloseTo(worst, 12);
    }
  });

  it("treats a broken count as nothing", () => {
    for (const model of ANSWER_MODELS) {
      expect(worstCaseUsd(Number.NaN, -1, model)).toBe(0);
      expect(worstCaseUsd(0, 0, model, Number.NaN)).toBe(0);
      expect(worstCaseUsd(0, 0, model, -286)).toBe(0);
    }
  });
});
