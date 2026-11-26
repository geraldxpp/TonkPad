// @vitest-environment node
import { describe, expect, it } from "vitest";
import { answerQuestion } from "../src/telegram/agent/answer";
import { ANSWER_TOOLS } from "../src/telegram/agent/tools";
import type { ClaudeOutcome } from "../src/telegram/claude/types";
import { answerJson, deps, endTurn, figuresUse, request, toolTurn } from "./agent-answer-fixtures";
import { claudeMessage, failure, fakeClaude, groupMessage, ok } from "./community-fixtures";
import { NOW } from "./fixtures";
import { answer, harness, mention, person, S, scripted, settle, verdict } from "./community-pipeline-fixtures";

/**
 * One tool round, then an answer (26 Nov 2026): Sonnet 5.5 answered
 * "/ask what are the specs of the launchpad?" by calling launchpad_figures
 * three times, the loop ran out of requests, and the member got "not sure".
 * Every request after the tool round now goes with tool_choice none.
 */

const NONE = { type: "none" };
const SPECS = "what are the specs of the launchpad?";
const figuresAnswer = () => endTurn(JSON.stringify(answerJson({ reply: "On launching: the launch fee is 0.005 ETH." })));

describe("answerQuestion: one tool round, then the answer", () => {
  it.each(["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"] as const)("on %s, sends the request after the round with tool_choice none, the tools still there", async (model) => {
    const client = fakeClaude([ok(toolTurn(figuresUse())), ok(figuresAnswer())]);
    const result = await answerQuestion(request({ question: SPECS }), deps(client, { model }));
    expect(result).toMatchObject({ kind: "answer", output: { reply: "On launching: the launch fee is 0.005 ETH." } });
    expect(result.kind === "answer" && result.facts).toContain("0.005 ETH");
    const [first, second] = client.calls.map((c) => c.params);
    expect(first).not.toHaveProperty("tool_choice");
    expect(second.tool_choice).toEqual(NONE);
    // Only tool_choice and the round itself change: the cached tools and system prompt are the same bytes.
    expect(second.tools).toEqual(ANSWER_TOOLS);
    expect(second.system).toEqual(first.system);
    expect({ ...second, tool_choice: undefined, messages: undefined }).toEqual({ ...first, tool_choice: undefined, messages: undefined });
  });

  it("ends a reply that still asks for tools after the round as no answer, and sends nothing more", async () => {
    const client = fakeClaude([ok(toolTurn(figuresUse("toolu_a"))), ok(toolTurn(figuresUse("toolu_b"))), ok(figuresAnswer())]);
    const d = deps(client, { model: "claude-sonnet-5-5" });
    expect(await answerQuestion(request({ question: SPECS }), d)).toEqual({ kind: "declined", reason: "invalid" });
    expect(client.calls).toHaveLength(2);
    expect(d.budget.commits).toEqual([1, 2]);
  });

  it("keeps tool_choice none on a retry after the round, and leaves the tools open on one before it", async () => {
    const after = fakeClaude([ok(toolTurn(figuresUse())), failure("network"), ok(figuresAnswer())]);
    expect((await answerQuestion(request({ question: SPECS }), deps(after))).kind).toBe("answer");
    expect(after.calls.map((c) => c.params.tool_choice ?? null)).toEqual([null, NONE, NONE]);
    const before = fakeClaude([failure("network"), ok(toolTurn(figuresUse())), ok(figuresAnswer())]);
    expect((await answerQuestion(request({ question: SPECS }), deps(before))).kind).toBe("answer");
    expect(before.calls.map((c) => c.params.tool_choice ?? null)).toEqual([null, null, NONE]);
  });

  it("never sets tool_choice on an answer that needs no tool", async () => {
    const client = fakeClaude([ok(endTurn())]);
    expect((await answerQuestion(request(), deps(client))).kind).toBe("answer");
    expect(client.calls[0].params).not.toHaveProperty("tool_choice");
  });
});

describe("the Q&A flow's log: why an answer wasn't shown, as codes only", () => {
  const QUESTION = "is WHOA a good buy?";
  const answerLines = (logs: readonly string[]) => logs.filter((l) => l.startsWith("answer "));

  it.each([
    ["a blocked answer", answer({ reply: "On WHOA: it is guaranteed, risk-free, and will 10x." }), "answer gate blocked (group): numbers"],
    ["a reply off the schema", ok(claudeMessage({ content: [{ type: "text", text: "not json", citations: null }], stop_reason: "end_turn" })), "answer not shown (group): declined (invalid)"],
    ["a cut-off reply", ok(claudeMessage({ content: [], stop_reason: "max_tokens" })), "answer not shown (group): declined (max_tokens)"],
  ] as Array<[string, ClaudeOutcome, string]>)("logs %s", async (_, outcome, line) => {
    const h = harness({ client: scripted({ answer: outcome }) });
    await h.send(mention(QUESTION));
    await settle();
    expect(answerLines(h.logs)).toEqual([line]);
    const all = h.logs.join("\n");
    for (const kept of ["WHOA", "good buy", "guaranteed", "10x", "not json"]) expect(all).not.toContain(kept);
  });

  it("logs nothing for an answer that is shown", async () => {
    const h = harness({ client: scripted({ answer: answer() }) });
    await h.send(mention("how much is the protocol fee?"));
    await settle();
    expect(answerLines(h.logs)).toEqual([]);
  });

  /** A question nobody asked the bot, offered by Haiku's check and answered 90 seconds later. */
  const unprompted = async (outcome: ClaudeOutcome) => {
    const h = harness({ client: scripted({ triage: verdict(), answer: outcome }) });
    await h.send(groupMessage("How long does the creator lock last on tonkfun?", { from: person(801) }));
    await settle();
    await h.tick(NOW + 90 * S);
    await settle();
    expect(h.kinds()).toEqual(["triage", "answer"]);
    expect(h.sends()).toEqual([]);
    return answerLines(h.logs);
  };

  it("logs nothing when the model declines an unprompted candidate as told: that silence is by design", async () => {
    expect(await unprompted(answer({ answered: false, reply: "" }))).toEqual([]);
    expect(await unprompted(answer({ answered: false, reply: "I can't say; it moved 20% today." }))).toEqual([]);
  });

  it("logs the gate holding back an unprompted answer that would have been posted", async () => {
    expect(await unprompted(answer({ reply: "On tonkfun: it is guaranteed to 10x, risk-free." }))).toEqual(["answer gate blocked (proactive): numbers"]);
  });
});
