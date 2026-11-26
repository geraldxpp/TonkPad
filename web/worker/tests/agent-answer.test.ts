// @vitest-environment node
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ANSWER_SETTINGS, answerQuestion } from "../src/telegram/agent/answer";
import { answerContext, answerSystem, coreText } from "../src/telegram/agent/prompt";
import { ANSWER_SCHEMA } from "../src/telegram/agent/schema";
import { ANSWER_TOOLS } from "../src/telegram/agent/tools";
import { claudeMessage, fakeClaude, ok, openBudget, textBlock } from "./community-fixtures";
import { answerJson, CODE, deps, endTurn, figuresUse, getTokenUse, LAUNCHPAD, OFFICIAL, pack, packSource, request, SOL_MINT, TOOL_TOKEN, toolTurn, WHOA } from "./agent-answer-fixtures";

const SEED = "abandon ability able about above absent absorb abstract absurd abuse access accident";
type Sent = Anthropic.MessageParam & { content: Array<Record<string, unknown>> };

describe("answerQuestion: the request", () => {
  it("asks Haiku 5.5 at effort high for the answer's JSON, with the two tools and the pseudonymous code", async () => {
    const client = fakeClaude([ok(endTurn())]);
    expect((await answerQuestion(request(), deps(client))).kind).toBe("answer");
    expect(client.calls).toHaveLength(1);
    const [{ kind, lane, timeoutMs, params }] = client.calls;
    expect({ kind, lane, timeoutMs }).toEqual({ kind: "answer", lane: "group", timeoutMs: 20_000 });
    expect(params).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 8000,
      output_config: { effort: "high", format: { type: "json_schema", schema: ANSWER_SCHEMA } },
      tools: ANSWER_TOOLS,
      system: answerSystem(pack(), "en", OFFICIAL),
      messages: [{ role: "user", content: request().question }, { role: "system", content: answerContext(request()) }],
      metadata: { user_id: CODE },
    });
    for (const key of ["thinking", "temperature", "top_p", "top_k", "tool_choice", "fallbacks", "stop_sequences", "stream"]) expect(params).not.toHaveProperty(key);
    expect(ANSWER_SETTINGS["claude-haiku-5-5"]).toEqual({ maxTokens: 8000, effort: "high", requestTimeoutMs: 20_000, deadlineMs: 45_000, minRequestMs: 3_000, maxRequests: 3 });
  });

  it("fixes each model's settings: Haiku 5.5 as before; Sonnet 5.5 and Opus 5.5 at medium with 2,500 tokens, 40 s a request, 60 s in all and a 10 s send floor (model#2)", () => {
    expect(ANSWER_SETTINGS).toEqual({
      "claude-haiku-5-5": { maxTokens: 8000, effort: "high", requestTimeoutMs: 20_000, deadlineMs: 45_000, minRequestMs: 3_000, maxRequests: 3 },
      "claude-sonnet-5-5": { maxTokens: 2500, effort: "medium", requestTimeoutMs: 40_000, deadlineMs: 60_000, minRequestMs: 10_000, maxRequests: 3 },
      "claude-opus-5-5": { maxTokens: 2500, effort: "medium", requestTimeoutMs: 40_000, deadlineMs: 60_000, minRequestMs: 10_000, maxRequests: 3 },
    });
    expect([ANSWER_SETTINGS, ...Object.values(ANSWER_SETTINGS)].every((s) => Object.isFrozen(s))).toBe(true);
  });

  it("carries metadata.user_id only for a pseudonymous code, never a raw ID or a name", async () => {
    for (const userCode of [null, "", "101", "sam_doe", CODE.toUpperCase(), `${CODE}00`]) {
      const client = fakeClaude([ok(endTurn())]);
      await answerQuestion(request({ userCode }), deps(client));
      expect(client.calls[0].params).not.toHaveProperty("metadata");
    }
  });

  it("puts a follow-up's earlier answer in an assistant turn, then the question, then the system message", async () => {
    const client = fakeClaude([ok(endTurn())]);
    const earlier = "On fees: every curve trade pays a fixed 1% protocol fee.";
    const req = request({ earlierAnswer: `  ${earlier}${" more".repeat(400)}`, lang: "es", lane: "private", chat: "private" });
    await answerQuestion(req, deps(client));
    const messages = client.calls[0].params.messages;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "system"]);
    expect(messages[0].content).toBe("The member is following up on your earlier answer.");
    expect(String(messages[1].content).startsWith(earlier)).toBe(true);
    expect([...String(messages[1].content)].length).toBeLessThanOrEqual(1_000);
    expect(messages.slice(2)).toEqual([{ role: "user", content: req.question }, { role: "system", content: answerContext(req) }]);
    expect(client.calls[0].params.system).toEqual(answerSystem(pack(), "es", OFFICIAL));
  });

  it("sends the question cleaned, masked again and cut to 600 characters, and nothing for an empty one", async () => {
    const client = fakeClaude([ok(endTurn())]);
    await answerQuestion(request({ question: `My phrase is ${SEED}, is it safe?\u200b ${"lorem ".repeat(150)}` }), deps(client));
    const sent = String(client.calls[0].params.messages[0].content);
    expect(sent.startsWith("My phrase is [hidden] is it safe? lorem lorem")).toBe(true);
    expect(sent).not.toContain("abandon");
    expect([...sent].length).toBeLessThanOrEqual(600);
    const none = fakeClaude([]);
    expect(await answerQuestion(request({ question: " \u200b\n " }), deps(none))).toEqual({ kind: "declined", reason: "invalid" });
    expect(none.calls).toHaveLength(0);
  });

  it("makes no call when the lane or the day has no room, or when the request would pass 80,000 characters", async () => {
    const budget = openBudget();
    budget.setOn(false, 0);
    const client = fakeClaude([]);
    expect(await answerQuestion(request(), deps(client, { budget }))).toEqual({ kind: "unavailable", reason: "budget" });
    const long = deps(client, { pack: packSource(pack({ core: "x".repeat(81_000) })) });
    expect(await answerQuestion(request(), long)).toEqual({ kind: "unavailable", reason: "too_long" });
    expect(client.calls).toHaveLength(0);
    expect([budget.tickets, long.budget.tickets]).toEqual([[], []]);
  });
});

describe("answerQuestion: what comes back", () => {
  it("answers from end_turn's JSON, read by block type, with the facts and the addresses it may show", async () => {
    const result = await answerQuestion(request(), deps(fakeClaude([ok(endTurn())])));
    expect(result).toEqual({ kind: "answer", output: answerJson(), facts: coreText(pack()), addresses: [LAUNCHPAD], token: null });
    const es = await answerQuestion(request({ lang: "es" }), deps(fakeClaude([ok(endTurn())])));
    expect(es.kind === "answer" && es.facts).toBe(`${coreText(pack())}\n\n${pack().glossary.es}`);
  });

  it("runs a tool round: the assistant's whole content back unchanged, thinking included, and every result in one user message", async () => {
    const first = toolTurn(getTokenUse(WHOA), figuresUse());
    const client = fakeClaude([ok(first), ok(endTurn(JSON.stringify(answerJson({ token: WHOA }))))]);
    const result = await answerQuestion(request({ askerAddresses: [WHOA] }), deps(client));
    expect(client.calls).toHaveLength(2);
    const [, , assistant, results] = client.calls[1].params.messages as Sent[];
    expect(assistant).toEqual({ role: "assistant", content: JSON.parse(JSON.stringify(first.content)) });
    expect(assistant.content[0]).toMatchObject({ type: "thinking", signature: expect.stringMatching(/^sig_test_/) });
    expect(results.role).toBe("user");
    expect(results.content.map((r) => [r.type, r.tool_use_id, "is_error" in r])).toEqual([["tool_result", "toolu_token", false], ["tool_result", "toolu_figures", false]]);
    expect(JSON.parse(String(results.content[1].content))).toMatchObject({ launchFee: "0.005 ETH" });
    if (result.kind !== "answer") throw new Error(result.kind);
    expect(result.token).toEqual(TOOL_TOKEN);
    expect(result.output.token).toBe(WHOA);
    expect(result.addresses).toEqual([LAUNCHPAD, WHOA]);
    expect(result.facts).toContain('"marketCapUsd":21400');
    expect(result.facts).toContain("0.005 ETH");
    expect(result.facts).not.toContain("77%");
  });

  it("marks a tool's failure as an error result, and answers every block of a long run", async () => {
    const uses = [getTokenUse(SOL_MINT, "toolu_0"), ...Array.from({ length: 6 }, (_, i) => figuresUse(`toolu_${i + 1}`))];
    const client = fakeClaude([ok(toolTurn(...uses)), ok(endTurn())]);
    const result = await answerQuestion(request(), deps(client));
    const results = (client.calls[1].params.messages as Sent[])[3].content;
    expect(results.map((r) => r.tool_use_id)).toEqual(uses.map((u) => u.id));
    expect(results.map((r) => r.is_error === true)).toEqual([true, false, false, false, false, false, true]);
    expect(result).toMatchObject({ kind: "answer", token: null, addresses: [LAUNCHPAD] });
  });

  it("declines a refusal without reading the content, counted in the lane and charged", async () => {
    const refusal = claudeMessage({ content: [], stop_reason: "refusal", thinking: false });
    Object.defineProperty(refusal, "content", {
      get() {
        throw new Error("the content was read");
      },
    });
    const d = deps(fakeClaude([ok(refusal)]));
    expect(await answerQuestion(request({ lane: "private" }), d)).toEqual({ kind: "declined", reason: "refusal" });
    expect(d.budget.refusals).toEqual(["private"]);
    expect(d.budget.settled).toEqual([{ ticket: d.budget.tickets[0], usage: expect.objectContaining({ output_tokens: 50 }), failure: null }]);
  });

  it("declines a max_tokens stop, a reply off the schema and any other stop", async () => {
    const cases: Array<[Anthropic.Message, string]> = [
      [claudeMessage({ content: [textBlock(JSON.stringify(answerJson()))], stop_reason: "max_tokens" }), "max_tokens"],
      [endTurn("not json"), "invalid"],
      [endTurn(JSON.stringify({ ...answerJson(), escalate: "maybe" })), "invalid"],
      [claudeMessage({ content: [], stop_reason: "end_turn" }), "invalid"],
      [claudeMessage({ content: [textBlock(JSON.stringify(answerJson()))], stop_reason: "pause_turn" }), "invalid"],
      [toolTurn(), "invalid"],
    ];
    for (const [message, reason] of cases) {
      const d = deps(fakeClaude([ok(message)]));
      expect(await answerQuestion(request(), d)).toEqual({ kind: "declined", reason });
      expect([d.budget.refusals, d.budget.failures, d.budget.settled.length]).toEqual([[], [], 1]);
    }
  });
});
