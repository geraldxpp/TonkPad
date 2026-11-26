import type Anthropic from "@anthropic-ai/sdk";
import { type ClaudeClient, type ClaudeOutcome, type ClaudeRequest, TRIAGE_MODEL, type Usage } from "../src/telegram/claude/types";

/** One scripted reply: an outcome, or a function of the request that returns one. */
export type ScriptStep = ClaudeOutcome | ((request: ClaudeRequest) => ClaudeOutcome);

/**
 * A Claude client that never touches the network: it answers each create()
 * with the next step of the script, in order, and records every request as
 * sent (a JSON copy, so the caller's later appends don't show in it). A call
 * past the end of the script rejects with a message saying so.
 */
export function fakeClaude(script: ScriptStep[]): ClaudeClient & { calls: ClaudeRequest[]; counted: Anthropic.MessageCountTokensParams[] } {
  const calls: ClaudeRequest[] = [];
  const counted: Anthropic.MessageCountTokensParams[] = [];
  return {
    calls,
    counted,
    async create(request) {
      const sent = JSON.parse(JSON.stringify(request)) as ClaudeRequest;
      calls.push(sent);
      const step = script[calls.length - 1];
      if (step === undefined) throw new Error(`fakeClaude: no scripted outcome for call ${calls.length}`);
      return typeof step === "function" ? step(sent) : step;
    },
    async countTokens(params) {
      counted.push(params);
      return Math.ceil(JSON.stringify(params).length / 4);
    },
  };
}

/** A successful outcome carrying this message. */
export const ok = (message: Anthropic.Message): ClaudeOutcome => ({ ok: true, message });

/** A failed outcome, as claude/client.ts reports one. */
export const failure = (kind: Extract<ClaudeOutcome, { ok: false }>["failure"], status: number | null = null, retryAfterMs: number | null = null): ClaudeOutcome => ({
  ok: false,
  failure: kind,
  type: null,
  status,
  retryAfterMs,
});

/** A text block as the API returns it. */
export const textBlock = (text: string): Record<string, unknown> => ({ type: "text", text, citations: null });

/** A tool_use block as the API returns it. */
export const toolUseBlock = (name: string, input: Record<string, unknown>, id = `toolu_${name}`): Record<string, unknown> => ({
  type: "tool_use",
  id,
  name,
  input,
  caller: { type: "direct" },
});

let serial = 0;

/**
 * A Message as Haiku 5.5 returns it: a thinking block with empty text and a
 * signature first (thinking is on by default; leave it out with thinking:
 * false, or by passing your own), then the given blocks. A refusal gets
 * stop_details unless given. Usage defaults to 100 tokens in and 50 out; a
 * cache_creation_input_tokens without its breakdown counts as 1-hour writes.
 */
export function claudeMessage(parts: {
  content: Array<Record<string, unknown>>;
  stop_reason: string;
  usage?: Partial<Usage>;
  thinking?: boolean;
  stop_details?: Anthropic.RefusalStopDetails | null;
}): Anthropic.Message {
  serial += 1;
  const own = parts.content.some((b) => b.type === "thinking" || b.type === "redacted_thinking");
  const thinking = parts.thinking === false || own ? [] : [{ type: "thinking", thinking: "", signature: `sig_test_${serial}` }];
  const writes = parts.usage?.cache_creation_input_tokens ?? 0;
  const usage: Usage = {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: writes,
    cache_creation: { ephemeral_1h_input_tokens: writes, ephemeral_5m_input_tokens: 0 },
    inference_geo: null,
    output_tokens_details: { thinking_tokens: 0 },
    server_tool_use: null,
    service_tier: "standard",
    speed: null,
    ...parts.usage,
  };
  const refusal: Anthropic.RefusalStopDetails | null = parts.stop_reason === "refusal" ? { type: "refusal", category: null, explanation: null } : null;
  return {
    id: `msg_test_${serial}`,
    type: "message",
    role: "assistant",
    model: TRIAGE_MODEL,
    container: null,
    diagnostics: null,
    content: [...thinking, ...parts.content] as unknown as Anthropic.ContentBlock[],
    stop_reason: parts.stop_reason as Anthropic.StopReason,
    stop_sequence: null,
    stop_details: parts.stop_details === undefined ? refusal : parts.stop_details,
    usage,
  };
}
