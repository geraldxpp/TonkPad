// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ANSWER_SETTINGS } from "../src/telegram/agent/answer";
import { ANSWER_MODELS } from "../src/telegram/claude/types";
import { ADMIN_CHAT_ID, groupMessage, OWNER_ID } from "./community-fixtures";
import { answer, harness, mention, person, scripted, settle, verdict } from "./community-pipeline-fixtures";

/**
 * The answers' model, wired from the config (TELEGRAM_AI_ANSWER_MODEL)
 * through community/index-build.ts to every answer: its request settings,
 * the model each reservation is priced on, and /status. Checks stay on
 * Haiku 5.5 whatever answers run on.
 */

describe("the configured answer model, through the pipeline", () => {
  it.each(ANSWER_MODELS)("sends each answer on %s at its settings, and its check on Haiku 5.5", async (model) => {
    const h = harness({ client: scripted({ triage: verdict(), answer: answer() }), answerModel: model });
    await h.send(mention("how much is the protocol fee on a curve trade?"));
    await settle();
    const s = ANSWER_SETTINGS[model];
    expect(h.calls.map((c) => [c.kind, c.params.model, c.params.max_tokens, c.params.output_config?.effort, c.timeoutMs])).toEqual([
      ["triage", "claude-haiku-5-5", 400, "low", 10_000],
      ["answer", model, s.maxTokens, s.effort, s.requestTimeoutMs],
    ]);
    expect(h.budget?.tickets.map((t) => [t.lane, t.model])).toEqual([["triage", "claude-haiku-5-5"], ["group", model]]);
    expect(h.sends()).toHaveLength(1);
  });

  it("names the answers' model and the checks' in /status", async () => {
    const h = harness({ answerModel: "claude-opus-5-5" });
    const team = { id: ADMIN_CHAT_ID, type: "supergroup" as const, title: "Team" };
    expect(await h.send(groupMessage("/status", { chat: team, from: person(OWNER_ID) }))).toBe("handled");
    await settle();
    const status = h.sends()[0][1];
    expect(status).toContain("<code>claude-opus-5-5</code> · ");
    expect(status).toContain("<code>claude-haiku-5-5</code>");
  });
});
