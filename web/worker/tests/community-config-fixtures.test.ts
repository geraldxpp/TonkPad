import { describe, expect, it } from "vitest";
import { type ClaudeClient, type ClaudeRequest, DEFAULT_ANSWER_MODEL, LANES, TRIAGE_MODEL } from "../src/telegram/claude/types";
import type { CommunityOut } from "../src/telegram/community/out";
import { LIFTED, MUTED, TEXT_ONLY } from "../src/telegram/community/permissions";
import { type Admins, ALERT_KINDS, COUNTER_KEYS, ESCALATIONS, type Records, RULE_CATEGORIES } from "../src/telegram/community/types";
import type { CommunityDictionary } from "../src/telegram/community/words";
import {
  actionsOf,
  adminInfo,
  claudeMessage,
  failure,
  fakeAdmins,
  fakeClaude,
  GROUP_ID,
  memoryRecords,
  ok,
  openBudget,
  OWNER_ID,
  recordOut,
  testWords,
  textBlock,
  toolUseBlock,
} from "./community-fixtures";
import { check, SAM, setup as realRecords } from "./community-records-setup";
import { HOUR, MIN, NOW } from "./fixtures";

const DAY = 24 * HOUR;
const request = (text: string): ClaudeRequest => ({ kind: "answer", lane: "group", timeoutMs: 30_000, params: { model: DEFAULT_ANSWER_MODEL, max_tokens: 4_000, messages: [{ role: "user", content: text }] } });

describe("the community test fixtures", () => {
  it("fakeClaude answers in order and records every request as it was sent", async () => {
    const answer = claudeMessage({ content: [textBlock('{"reply":"On fees: 1%."}')], stop_reason: "end_turn" });
    const client: ClaudeClient & { calls: ClaudeRequest[] } = fakeClaude([ok(answer), (r) => (r.lane === "group" ? failure("timeout") : ok(answer))]);
    const first = request("one");
    expect(await client.create(first)).toEqual({ ok: true, message: answer });
    first.params.messages.push({ role: "assistant", content: "appended after the call" });
    expect(await client.create(request("two"))).toEqual({ ok: false, failure: "timeout", type: null, status: null, retryAfterMs: null });
    await expect(client.create(request("three"))).rejects.toThrow("no scripted outcome for call 3");
    expect(client.calls.map((c) => c.params.messages[0].content)).toEqual(["one", "two", "three"]);
    expect(client.calls[0].params.messages).toHaveLength(1);
  });

  it("claudeMessage answers as Haiku 5.5 does, an empty thinking block first", () => {
    const m = claudeMessage({ content: [toolUseBlock("get_token", { address: "0xabc" })], stop_reason: "tool_use", usage: { cache_read_input_tokens: 17_500, cache_creation_input_tokens: 300 } });
    expect(m.content.map((b) => b.type)).toEqual(["thinking", "tool_use"]);
    expect(m.content[0]).toMatchObject({ type: "thinking", thinking: "" });
    expect(m).toMatchObject({ model: "claude-haiku-5-5", stop_reason: "tool_use", stop_details: null });
    expect(m.usage).toMatchObject({ input_tokens: 100, cache_read_input_tokens: 17_500, cache_creation: { ephemeral_1h_input_tokens: 300, ephemeral_5m_input_tokens: 0 } });
    expect(claudeMessage({ content: [], stop_reason: "refusal" }).stop_details).toMatchObject({ type: "refusal", category: null });
    expect(claudeMessage({ content: [textBlock("{}")], stop_reason: "end_turn", thinking: false }).content).toHaveLength(1);
  });

  it("memoryRecords keeps offences 7 days, checks, counters by UTC day, and forgets a member", () => {
    const records: Records = memoryRecords({ strictness: "normal" });
    expect(records.settings(GROUP_ID)).toEqual({ paused: false, proactive: true, strictness: "normal", raidUntil: 0 });
    records.addOffence(GROUP_ID, 101, NOW, "unknown_link", false);
    expect(records.addOffence(GROUP_ID, 101, NOW + MIN, "lookalike", true)).toEqual({ n: 2, certain: 1, last: NOW + MIN, category: "lookalike" });
    // As records.ts: the undone offence counts as the certain one, so an undone offence never leads to a ban.
    expect(records.removeOffence(GROUP_ID, 101)).toMatchObject({ n: 1, certain: 0 });
    expect(records.offences(GROUP_ID, 101, NOW + MIN + 7 * DAY).n).toBe(0);
    records.setPending({ chat: GROUP_ID, user: 101, messageId: 9, joinMessageId: 8, deadline: NOW + 5 * MIN, target: null, tries: 0 });
    records.setPending({ chat: GROUP_ID, user: 102, messageId: 9, joinMessageId: 8, deadline: NOW + 5 * MIN, target: null, tries: 0 });
    expect(records.pendingOn(GROUP_ID, 9).map((p) => p.user)).toEqual([101, 102]);
    expect(records.duePending(NOW + 5 * MIN)).toHaveLength(2);
    records.count(GROUP_ID, "removed", NOW, 2);
    expect(records.counts(GROUP_ID, NOW).removed).toBe(2);
    expect(records.counts(GROUP_ID, NOW + DAY)).toEqual(Object.fromEntries(COUNTER_KEYS.map((k) => [k, 0])));
    records.trust(GROUP_ID, 101, "a1b2c3d4e5f60718", NOW);
    expect([records.trustedName(GROUP_ID, 101, "a1b2c3d4e5f60718"), records.trustedName(GROUP_ID, 101, "ffffffffffffffff")]).toEqual([true, false]);
    records.forgetMember(GROUP_ID, 101);
    expect([records.isTrusted(GROUP_ID, 101), records.pending(GROUP_ID, 101), records.offences(GROUP_ID, 101, NOW).n]).toEqual([false, null, 0]);
    records.prune(NOW + 10 * MIN);
    expect(records.pending(GROUP_ID, 102)).toBeNull();
  });

  it("memoryRecords keeps a check as long as community/records.ts does: until 5 minutes after its deadline, when the restriction ends", () => {
    for (const records of [memoryRecords(), realRecords().records]) {
      // Due at NOW + 5 minutes.
      records.setPending(check(SAM));
      records.prune(NOW + 10 * MIN - 1);
      expect(records.pending(GROUP_ID, SAM)).not.toBeNull();
      records.prune(NOW + 10 * MIN);
      expect(records.pending(GROUP_ID, SAM)).toBeNull();
    }
  });

  it("recordOut records each call in order and answers through its overrides", async () => {
    const out: CommunityOut = recordOut();
    const recorded = recordOut({ send: async () => null, member: async () => null });
    expect(await out.send(GROUP_ID, "<i>AI answer</i>", { kind: "answer", replyTo: 3 })).toBe(5_001);
    expect(await recorded.send(GROUP_ID, "x", { kind: "notice" })).toBeNull();
    recorded.room(GROUP_ID, "notice");
    await recorded.member(GROUP_ID, 101);
    recorded.remove(GROUP_ID, [1, 2]);
    await recorded.restrict(GROUP_ID, 101, MUTED, Math.floor(NOW / 1000) + 600);
    expect(recorded.log.map((c) => c.op)).toEqual(["send", "room", "member", "remove", "restrict"]);
    expect(actionsOf(recorded.log).map((c) => c.op)).toEqual(["send", "remove", "restrict"]);
  });

  it("fakeAdmins checks each right, never passes an anonymous admin, and forgets on drop", async () => {
    const admins: Admins = fakeAdmins({ [GROUP_ID]: [adminInfo(1, { creator: true }), adminInfo(2, { canRestrict: false }), adminInfo(3, { anonymous: true })] }, [OWNER_ID]);
    const can = (user: number, right: "any" | "delete" | "restrict" | "owner") => admins.can(GROUP_ID, user, right, NOW);
    expect(await Promise.all([can(1, "owner"), can(2, "delete"), can(2, "restrict"), can(3, "any"), can(OWNER_ID, "owner"), can(99, "any")])).toEqual([true, true, false, false, true, false]);
    admins.drop(GROUP_ID, 2);
    expect(admins.isAdmin(GROUP_ID, 2)).toBe(false);
  });

  it("openBudget allows while on and records reservations, with their model, and commits", () => {
    const budget = openBudget();
    const ticket = budget.reserve("triage", 0.0001, NOW, TRIAGE_MODEL);
    expect(ticket).toEqual({ id: 1, lane: "triage", worstUsd: 0.0001, model: "claude-haiku-5-5" });
    if (ticket) budget.commit(ticket, null, "timeout", NOW);
    expect([budget.commits, budget.settled[0].failure]).toEqual([[1], "timeout"]);
    budget.setOn(false, NOW);
    expect([budget.available("group", NOW), budget.reserve("group", 0.05, NOW, DEFAULT_ANSWER_MODEL), budget.status(NOW).reason]).toEqual([false, null, "admin"]);
    expect(Object.keys(budget.status(NOW).lanes)).toEqual([...LANES]);
  });
});

describe("the community contracts", () => {
  it("names all 16 permissions in each set, frozen", () => {
    expect(Object.keys(MUTED)).toHaveLength(16);
    expect(Object.values(MUTED).every((v) => v === false)).toBe(true);
    expect(Object.values(LIFTED).every((v) => v === true)).toBe(true);
    expect(Object.entries(TEXT_ONLY).filter(([, v]) => v).map(([k]) => k)).toEqual(["can_send_messages", "can_react_to_messages"]);
    expect([Object.isFrozen(MUTED), Object.isFrozen(TEXT_ONLY), Object.isFrozen(LIFTED)]).toEqual([true, true, true]);
  });

  it("gives every rule, case and alert kind a string in the placeholder words", () => {
    const words: CommunityDictionary = testWords;
    expect(Object.keys(words.mod.reasons).sort()).toEqual([...RULE_CATEGORIES].sort());
    expect(Object.keys(words.admin.kinds).sort()).toEqual([...ALERT_KINDS].sort());
    expect(Object.keys(words.admin.categories).sort()).toEqual([...new Set([...RULE_CATEGORIES, ...ESCALATIONS])].sort());
    expect(new Set(ALERT_KINDS).size).toBe(ALERT_KINDS.length);
  });

  it("gives /status a word for every counter, lane and the queues, and a review one for each standing", () => {
    const { admin } = testWords;
    expect(Object.keys(admin.counters).sort()).toEqual([...COUNTER_KEYS].sort());
    expect(Object.keys(admin.lanes).sort()).toEqual([...LANES].sort());
    expect(Object.keys(admin.standing).sort()).toEqual(["muted", "none", "removed", "restricted"]);
    const plain = [admin.noRight, admin.reportedBy, admin.byHand, admin.olderMessages, admin.checkFailed, admin.status.queues, admin.budget.notFound];
    const keyed = [...Object.values(admin.counters), ...Object.values(admin.lanes), ...Object.values(admin.standing)];
    // None of them takes a placeholder.
    for (const text of [...plain, ...keyed]) expect(text).toMatch(/^[^{}]+$/);
  });
});
