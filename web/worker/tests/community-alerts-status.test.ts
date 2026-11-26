import { describe, expect, it } from "vitest";
import type { BudgetStatus } from "../src/telegram/claude/types";
import { type StatusInput, statusView } from "../src/telegram/community/status";
import { COUNTER_KEYS, type CounterKey } from "../src/telegram/community/types";
import { testWords } from "./community-fixtures";
import { HOUR, MIN, NOW } from "./fixtures";

describe("statusView", () => {
  const lane = (spentUsd: number, capUsd: number) => ({ spentUsd, capUsd, calls: 1 });
  const budget: BudgetStatus = {
    day: "2026-11-06", spentUsd: 0.4213, capUsd: 3, on: true, reason: null, until: null, refusals: 0, errors: 0,
    lanes: { triage: lane(0.1, 3), group: lane(0.2, 1.35), proactive: lane(0, 0.45), private: lane(0.1213, 0.9) },
  };
  const input: StatusInput = {
    title: "tonkfun.fun <community>",
    counts: Object.fromEntries(COUNTER_KEYS.map((key, i) => [key, i])) as Record<CounterKey, number>,
    budget,
    settings: { paused: false, proactive: true, strictness: "normal", raidUntil: 0 },
    knowledge: { local: "ab12cd34", site: "ab12cd34", match: true, contact: "set" },
    rights: { delete: true, restrict: true },
    queues: { answers: 2, checks: 0 },
    now: NOW,
  };

  it("shows today's numbers, the budget per lane, the mode, the knowledge, the rights and the queues", () => {
    const view = statusView(input, testWords);
    expect(view.keyboard).toBeUndefined();
    expect(view.text.split("\n")).toEqual([
      "<b>Status</b> · tonkfun·fun &lt;community&gt;",
      "<b>Answers</b>: Direct answers 0 · Unprompted answers 1 · Private answers 2 · Refused 3 · Cases sent to the team 4 · Members at risk 14",
      "<b>Moderation</b>: Messages removed 5 · Warnings 6 · Mutes 7 · Bans 8 · Links held 15 · Reports 12 · Reviews asked 13",
      "<b>Members</b>: Checks started 10 · Checks passed 11 · Removed by the check 9",
      "<b>AI budget</b>: $0.4213 / $3.00 · AI on",
      "Checks $0.10 / $3.00 · Group answers $0.20 / $1.35 · Unprompted answers $0.00 / $0.45 · Private answers $0.1213 / $0.90",
      "<b>Mode</b>: Level normal · Raid off · Unprompted on",
      "<b>Knowledge</b>: <code>ab12cd34</code> · <code>ab12cd34</code> · <code>contact</code> set",
      "<b>Rights</b>: Delete · Ban",
      "<b>Queues</b>: Answers 2 · Checks 0",
    ]);
  });

  it("labels every counter, lane and queue in the bot's words, leaving only the hashes and the contact as code", () => {
    const words = { ...testWords, admin: { ...testWords.admin, counters: { ...testWords.admin.counters, held: "<Held>" }, lanes: { ...testWords.admin.lanes, private: "Private & paid" } } };
    const text = statusView({ ...input, queues: { checks: 3 } }, words).text;
    expect(text.match(/<code>[^<]*<\/code>/g)).toEqual(["<code>ab12cd34</code>", "<code>ab12cd34</code>", "<code>contact</code>"]);
    for (const key of COUNTER_KEYS) expect(text).not.toContain(`<code>${key}</code>`);
    expect(text).toContain("&lt;Held&gt; 15");
    expect(text).toContain("Private &amp; paid $0.1213 / $0.90");
    expect(text.split("\n").at(-1)).toBe("<b>Queues</b>: Checks 3");
  });

  it("names the models answers and checks run on under the budget, as code after the queues' words, while AI can run", () => {
    const lines = statusView({ ...input, answerModel: "claude-sonnet-5-5" }, testWords).text.split("\n");
    expect(lines.slice(4, 8)).toEqual([
      "<b>AI budget</b>: $0.4213 / $3.00 · AI on",
      "Checks $0.10 / $3.00 · Group answers $0.20 / $1.35 · Unprompted answers $0.00 / $0.45 · Private answers $0.1213 / $0.90",
      "Answers <code>claude-sonnet-5-5</code> · Checks <code>claude-haiku-5-5</code>",
      "<b>Mode</b>: Level normal · Raid off · Unprompted on",
    ]);
    // No model runs without a budget; and a model ID is escaped like any text.
    expect(statusView({ ...input, budget: null, answerModel: "claude-sonnet-5-5" }, testWords).text).not.toContain("<code>claude-");
    expect(statusView({ ...input, answerModel: "<b>x</b>" }, testWords).text).toContain("Answers <code>&lt;b&gt;x&lt;/b&gt;</code>");
  });

  it("says why AI is off, when raid mode ends, a stale pack, a missing contact and a missing right", () => {
    const off = statusView(
      {
        ...input,
        budget: { ...budget, on: false, reason: "cap", until: NOW + 2 * HOUR },
        settings: { paused: true, proactive: false, strictness: "strict", raidUntil: NOW + 30 * MIN },
        knowledge: { local: "ab12cd34", site: "ffee0011", match: false, contact: "none" },
        rights: { delete: true, restrict: false },
        queues: {},
      },
      testWords,
    ).text.split("\n");
    expect(off[4]).toBe("<b>AI budget</b>: $0.4213 / $3.00 · AI off · Today's AI budget of $3.00 is used up. (14:00 UTC)");
    expect(off[6]).toBe("<b>Mode</b>: Level strict · Raid on (12:30 UTC) · Unprompted off · AI answers are paused for now.");
    expect(off[7]).toBe("<b>Knowledge</b>: <code>ab12cd34</code> · <code>ffee0011</code> · My knowledge is older than the site: redeploy the worker. · <code>contact</code> none · The Security page has no contact.");
    expect(off[8]).toBe("<b>Rights</b>: Delete · I'm missing a right in tonkfun·fun &lt;community&gt;.");
    expect(off).toHaveLength(9);
    const missing = statusView({ ...input, budget: { ...budget, on: false, reason: "not_found", until: null } }, testWords).text.split("\n");
    expect(missing[4]).toBe(`<b>AI budget</b>: $0.4213 / $3.00 · AI off · ${testWords.admin.budget.notFound}`);
  });

  it("says AI is off while a ramp limit's wait or a refused key stops every call, with when it ends", () => {
    const line = (reason: BudgetStatus["reason"], until: number | null) => statusView({ ...input, budget: { ...budget, on: false, reason, until } }, testWords).text.split("\n")[4];
    expect(line("ramp", NOW + 2 * MIN)).toBe(`<b>AI budget</b>: $0.4213 / $3.00 · AI off · ${testWords.admin.budget.ramp} (12:02 UTC)`);
    expect(line("auth", NOW + HOUR)).toBe(`<b>AI budget</b>: $0.4213 / $3.00 · AI off · ${testWords.admin.budget.auth} (13:00 UTC)`);
    expect(line("ramp", null)).toBe(`<b>AI budget</b>: $0.4213 / $3.00 · AI off · ${testWords.admin.budget.ramp}`);
  });

  it("reads a raid that has ended as off, and unknown budget, knowledge and rights plainly", () => {
    const lines = statusView({ ...input, budget: null, knowledge: null, rights: null, settings: { ...input.settings, raidUntil: NOW - MIN } }, testWords).text.split("\n");
    expect(lines.slice(4, 8)).toEqual(["<b>AI budget</b>: AI off", "<b>Mode</b>: Level normal · Raid off · Unprompted on", "<b>Knowledge</b>: ?", "<b>Rights</b>: ?"]);
  });
});
