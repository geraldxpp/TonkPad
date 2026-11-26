// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BudgetEvent } from "../src/telegram/claude/budget";
import { type BudgetStatus, type CallKind, LANES } from "../src/telegram/claude/types";
import { budgetAlert, sendPrompt } from "../src/telegram/community/index-setup";
import { COMMUNITY_DICTIONARIES, communityWords } from "../src/telegram/i18n/community";
import { escapeHtml } from "../src/telegram/text";
import { ADMIN_CHAT_ID, callsOf, failure, fakeClaude, groupMessage, recordOut, testWords } from "./community-fixtures";
import { person } from "./community-pipeline-fixtures";
import { sentTo, startBench } from "./community-start-fixtures";
import { NOW, SEC } from "./fixtures";

/**
 * The budget's events in the admin chat (claude#4, words#2): a refused key
 * and a malformed request each say what happened and what to do, never
 * "after repeated errors"; stops that need an owner stay in the chat. A
 * pause, a bad request or a return about one kind of call names it:
 * moderation checks or AI answers (answers#13).
 */

const status = (reason: BudgetStatus["reason"]): BudgetStatus => ({
  day: new Date(NOW).toISOString().slice(0, 10), spentUsd: 2.5, capUsd: 3,
  lanes: Object.fromEntries(LANES.map((lane) => [lane, { spentUsd: 0, capUsd: 1, calls: 0 }])) as BudgetStatus["lanes"],
  on: reason === null, reason, until: null, refusals: 0, errors: 1,
});

describe("budgetAlert", () => {
  it("says a refused key is the key, with what to check, and keeps that alert for an owner", () => {
    const a = budgetAlert("auth", status("auth"), null, null, testWords);
    expect(a.done).toBe(testWords.admin.budget.auth);
    expect(a.done).not.toBe(testWords.admin.budget.circuit);
    expect(a).toMatchObject({ kind: "budget", chat: null, member: null, excerpt: null, routine: false, urgent: false });
  });

  it("says a malformed request is that, not repeated errors, as a routine note", () => {
    const a = budgetAlert("bad_request", status("circuit"), null, null, testWords);
    expect(a.done).toBe(testWords.admin.budget.badRequest);
    expect(a.routine).toBe(true);
  });

  it("keeps each event's own words: the burst of errors, billing, a missing model, AI back, the 80% mark, a lane and the cap", () => {
    const fixed: Array<[BudgetEvent, string, boolean]> = [
      ["circuit", testWords.admin.budget.circuit, true],
      ["billing", testWords.admin.budget.billing, false],
      ["not_found", testWords.admin.budget.notFound, false],
      ["restored", testWords.admin.budget.restored, true],
    ];
    for (const [event, done, routine] of fixed) expect(budgetAlert(event, status(null), null, null, testWords), event).toMatchObject({ done, routine });
    expect(budgetAlert("warn80", status(null), null, null, testWords).done).toBe("AI spending is at 2.50 USD of 3.00 USD today.");
    expect(budgetAlert("lane", status(null), "group", null, testWords).done).toBe(`The ${testWords.admin.lanes.group} budget is used up for today.`);
    expect(budgetAlert("cap", status("cap"), null, null, testWords).done).toBe("Today's AI budget of 3.00 USD is used up.");
  });

  it("has words for a refused key and a malformed request in every language", () => {
    for (const [code, d] of Object.entries(COMMUNITY_DICTIONARIES)) {
      expect((budgetAlert("auth", status("auth"), null, null, d).done ?? "").trim(), code).not.toBe("");
      expect((budgetAlert("bad_request", status("circuit"), null, null, d).done ?? "").trim(), code).not.toBe("");
      expect(d.admin.budget.auth, code).not.toBe(d.admin.budget.circuit);
    }
  });
});

describe("budgetAlert: one kind of call (answers#13)", () => {
  const b = testWords.admin.budget;
  /** Each event about one kind of call, the kind, and the words the admins get. */
  const BY_KIND: Array<[BudgetEvent, CallKind | null, string]> = [
    ["circuit", "triage", b.circuitChecks],
    ["circuit", "answer", b.circuitAnswers],
    ["circuit", null, b.circuit],
    ["bad_request", "triage", b.badRequestChecks],
    ["bad_request", "answer", b.badRequestAnswers],
    ["bad_request", null, b.badRequest],
    ["restored", "triage", b.backChecks],
    ["restored", "answer", b.backAnswers],
    ["restored", null, b.restored],
  ];

  it.each(BY_KIND)("%s about %s says so, as a routine note", (event, kind, done) => {
    expect(budgetAlert(event, status(null), null, kind, testWords)).toMatchObject({ kind: "budget", done, routine: true, urgent: false });
  });

  it("names a kind's checks and answers apart, and never as AI as a whole", () => {
    for (const event of ["circuit", "bad_request", "restored"] as const) {
      const checks = budgetAlert(event, status(null), null, "triage", testWords).done;
      const answers = budgetAlert(event, status(null), null, "answer", testWords).done;
      const all = budgetAlert(event, status(null), null, null, testWords).done;
      expect(new Set([checks, answers, all]).size, event).toBe(3);
    }
  });

  it("keeps the words of a stop of every call, whatever kind is passed", () => {
    const stops: Array<[BudgetEvent, string]> = [["auth", b.auth], ["billing", b.billing], ["not_found", b.notFound]];
    for (const [event, done] of stops) for (const kind of ["triage", "answer"] as const) expect(budgetAlert(event, status(null), null, kind, testWords).done, `${event} ${kind}`).toBe(done);
    expect(budgetAlert("lane", status(null), "group", "answer", testWords).done).toBe(`The ${testWords.admin.lanes.group} budget is used up for today.`);
  });

  it("has each kind's words in every language", () => {
    for (const [code, d] of Object.entries(COMMUNITY_DICTIONARIES)) {
      for (const [event, kind] of BY_KIND) expect((budgetAlert(event, status(null), null, kind, d).done ?? "").trim(), `${code} ${event} ${kind}`).not.toBe("");
    }
  });
});

describe("a budget event in the running agent (answers#13)", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "community-start-budget-"));
    vi.useFakeTimers({ now: NOW, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("tells the admin chat a malformed check paused the moderation checks, in their own words, and logs which kind", async () => {
    const s = startBench(dir, { env: { TELEGRAM_COMMUNITY_MODE: "normal" } });
    s.deps.now = () => Date.now();
    // Every model call is refused as malformed.
    s.deps.client = fakeClaude(Array.from({ length: 20 }, () => failure("bad_request", 400)));
    const hooks = await s.start();
    try {
      await hooks?.onMessage(groupMessage("how do I claim my creator rewards on a token I launched?", { from: person(4_242) }), false);
      await vi.advanceTimersByTimeAsync(2 * SEC);
      const b = communityWords("en").admin.budget;
      const admin = sentTo(s.api.calls, ADMIN_CHAT_ID).join("\n");
      expect(admin).toContain(escapeHtml(b.badRequestChecks));
      expect(admin).not.toContain(escapeHtml(b.badRequest));
      expect(s.logs).toContain("AI budget: bad_request (triage)");
    } finally {
      hooks?.stop();
    }
  });
});

describe("sendPrompt", () => {
  it("sends the Ask prompt's reply field through the community's queue, like an answer", async () => {
    const out = recordOut();
    const forceReply = { force_reply: true as const, input_field_placeholder: "Your question" };
    await sendPrompt(out, 101, { text: "Ask me anything", forceReply });
    expect(callsOf(out.log, "send")).toEqual([[101, "Ask me anything", { kind: "answer", forceReply }]]);
  });
});
