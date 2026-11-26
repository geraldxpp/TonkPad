import type { ClaudeModel, Usage } from "../src/telegram/claude/types";

/** The model the ledger's tests reserve for: costing() is priced on its card. */
export const HAIKU: ClaudeModel = "claude-haiku-5-5";

/** Usage that costs exactly `usd` on Haiku 5.5's card (claude/prices.ts): output tokens at $0.50 per million. */
export const costing = (usd: number): Usage => ({
  input_tokens: 0,
  output_tokens: Math.round(usd * 2e6),
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_creation: null,
  inference_geo: null,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: "standard",
  speed: null,
});
