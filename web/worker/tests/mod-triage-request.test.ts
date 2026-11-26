// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Budget, ClaudeClient } from "../src/telegram/claude/types";
import { TRIAGE_DEADLINE_MS, TRIAGE_SETTINGS, triageMessage } from "../src/telegram/mod/triage";
import { TRIAGE_SCHEMA, triageSystem, triageUserContent } from "../src/telegram/mod/triage-prompt";
import { claudeMessage, failure, fakeClaude, ok, openBudget, textBlock } from "./community-fixtures";
import { NOW } from "./fixtures";
import { ALLOW } from "./mod-rules-fixtures";
import { INPUT, OFFICIAL, VALID, verdictReply } from "./mod-triage-fixtures";

/** A pseudonymous code as claude/user-code.ts makes it. */
const CODE = "0123456789abcdef0123456789abcdef";
const deps = (client: ClaudeClient, budget: Budget = openBudget()) => ({ client, budget, official: OFFICIAL, allow: ALLOW, now: () => NOW });
const answered = () => fakeClaude([ok(verdictReply(JSON.stringify(VALID)))]);

describe("triageMessage: the request", () => {
  it("is one call with thinking off, effort low, 400 tokens, the verdict's schema and the system prompt cached for an hour", async () => {
    const client = answered();
    expect(await triageMessage(INPUT, deps(client), CODE)).toEqual(VALID);
    expect(client.calls).toHaveLength(1);
    const [{ kind, lane, timeoutMs, params }] = client.calls;
    expect({ kind, lane, timeoutMs }).toEqual({ kind: "triage", lane: "triage", timeoutMs: 10_000 });
    expect(params).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 400,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: { type: "json_schema", schema: TRIAGE_SCHEMA } },
      system: [{ type: "text", text: triageSystem(OFFICIAL, ALLOW), cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: triageUserContent(INPUT) }],
      metadata: { user_id: CODE },
    });
    for (const key of ["tools", "tool_choice", "temperature", "top_p", "top_k", "fallbacks", "stop_sequences", "stream"]) expect(params).not.toHaveProperty(key);
    expect(TRIAGE_SETTINGS).toEqual({ maxTokens: 400, effort: "low", timeoutMs: 10_000 });
    expect(Object.isFrozen(TRIAGE_SETTINGS)).toBe(true);
  });

  it("carries metadata.user_id only for a pseudonymous code, never a raw ID or a name", async () => {
    for (const code of [null, "", "101", "sam_doe", CODE.toUpperCase(), `${CODE}00`]) {
      const client = answered();
      expect(await triageMessage(INPUT, deps(client), code)).toEqual(VALID);
      expect(client.calls[0].params).not.toHaveProperty("metadata");
    }
  });

  it("reserves the request's worst case on Haiku 5.5 in the triage lane, with no tool prompt (a check has no tools), then charges its usage", async () => {
    const client = answered();
    const budget = openBudget();
    await triageMessage(INPUT, deps(client, budget), null);
    const chars = JSON.stringify(client.calls[0].params).length;
    // One token per 2 characters, rounded up, at Haiku 5.5's 1-hour write rate ($0.20), plus 400 out at $0.50 (model#3).
    const worst = (Math.ceil(chars / 2) * 0.2 + 400 * 0.5) / 1e6;
    expect(budget.tickets).toEqual([{ id: 1, lane: "triage", worstUsd: expect.closeTo(worst, 12), model: "claude-haiku-5-5" }]);
    expect(budget.settled).toEqual([{ ticket: budget.tickets[0], usage: expect.objectContaining({ input_tokens: 100, output_tokens: 50 }), failure: null }]);
    expect([budget.failures, budget.refusals]).toEqual([[], []]);
  });

  it("makes no call when the lane or the day has no room", async () => {
    const client = fakeClaude([]);
    const budget = openBudget();
    budget.setOn(false, NOW);
    expect(await triageMessage(INPUT, deps(client, budget), CODE)).toBeNull();
    expect(client.calls).toHaveLength(0);
    expect(budget.settled).toHaveLength(0);
  });
});

describe("triageMessage: what comes back", () => {
  it("reads the verdict by block type, after any thinking block", async () => {
    const crisis = { ...VALID, question: "none", needs_human: "crisis", reason: "Says they don't want to go on" };
    const client = fakeClaude([ok(claudeMessage({ content: [textBlock(JSON.stringify(crisis))], stop_reason: "end_turn" }))]);
    expect(await triageMessage(INPUT, deps(client), null)).toEqual(crisis);
  });

  it("returns null on a refusal, counted in the triage lane and charged", async () => {
    const client = fakeClaude([ok(claudeMessage({ content: [], stop_reason: "refusal", thinking: false }))]);
    const budget = openBudget();
    expect(await triageMessage(INPUT, deps(client, budget), CODE)).toBeNull();
    expect(budget.refusals).toEqual(["triage"]);
    expect(budget.settled).toEqual([{ ticket: budget.tickets[0], usage: expect.objectContaining({ output_tokens: 50 }), failure: null }]);
    expect(budget.failures).toEqual([]);
  });

  it("returns null on a failure, counted toward the breaker and settled, with no retry", async () => {
    for (const [kind, status] of [["timeout", null], ["network", null], ["rate_limited", 429], ["overloaded", 529], ["billing", 402], ["bad_request", 400]] as const) {
      const client = fakeClaude([failure(kind, status)]);
      const budget = openBudget();
      expect(await triageMessage(INPUT, deps(client, budget), CODE)).toBeNull();
      expect(client.calls).toHaveLength(1);
      expect(budget.failures).toEqual([kind]);
      expect(budget.settled).toEqual([{ ticket: budget.tickets[0], usage: null, failure: kind }]);
    }
  });

  it("counts a client that rejects as an unknown failure, and never rejects itself", async () => {
    const budget = openBudget();
    await expect(triageMessage(INPUT, deps(fakeClaude([]), budget), CODE)).resolves.toBeNull();
    expect(budget.failures).toEqual(["unknown"]);
    expect(budget.settled).toEqual([{ ticket: budget.tickets[0], usage: null, failure: "unknown" }]);
  });

  it("gives up on a call that never ends at the deadline, as a timeout, and settles it", async () => {
    vi.useFakeTimers();
    try {
      const budget = openBudget();
      const stalled: ClaudeClient = { create: () => new Promise(() => undefined), countTokens: async () => null };
      const pending = triageMessage(INPUT, deps(stalled, budget), CODE);
      await vi.advanceTimersByTimeAsync(TRIAGE_DEADLINE_MS - 1);
      expect(budget.settled).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toBeNull();
      expect(TRIAGE_DEADLINE_MS).toBe(12_000);
      expect(budget.failures).toEqual(["timeout"]);
      expect(budget.settled).toEqual([{ ticket: budget.tickets[0], usage: null, failure: "timeout" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("settles the reservation even when the budget throws while counting a failure", async () => {
    const budget = openBudget();
    budget.failed = () => {
      throw new Error("ledger down");
    };
    await expect(triageMessage(INPUT, deps(fakeClaude([failure("server", 500)]), budget), CODE)).resolves.toBeNull();
    expect(budget.settled).toEqual([{ ticket: budget.tickets[0], usage: null, failure: "server" }]);
  });

  it("returns null for a reply cut short, unreadable, empty or off the schema, and still charges it", async () => {
    const replies = [
      verdictReply(JSON.stringify(VALID).slice(0, 40), "max_tokens"),
      verdictReply(JSON.stringify(VALID), "max_tokens"),
      verdictReply("I think this message is fine."),
      verdictReply(JSON.stringify({ ...VALID, verdict: "maybe" })),
      verdictReply(JSON.stringify({ ...VALID, extra: true })),
      claudeMessage({ content: [], stop_reason: "end_turn", thinking: false }),
    ];
    for (const reply of replies) {
      const budget = openBudget();
      expect(await triageMessage(INPUT, deps(fakeClaude([ok(reply)]), budget), null)).toBeNull();
      expect(budget.settled).toHaveLength(1);
      expect(budget.settled[0].usage).not.toBeNull();
      expect([budget.failures, budget.refusals]).toEqual([[], []]);
    }
  });
});
