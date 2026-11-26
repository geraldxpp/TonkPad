import { describe, expect, it } from "vitest";
import type { CommunityOut } from "../src/telegram/community/out";
import type { AdminAlert, Decision } from "../src/telegram/community/types";
import { applyDecision, type ModDeps, type ModTarget } from "../src/telegram/mod/actions";
import { leftSince, noteLeft } from "../src/telegram/mod/actions-left";
import { callsOf, GROUP_ID, MEMBER, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";

const DAY = 86_400;
const MINUTE = 60_000;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(overrides: Partial<CommunityOut> = {}, at = () => NOW) {
  const out = recordOut(overrides);
  const records = memoryRecords({ strictness: "normal" });
  const alerts: AdminAlert[] = [];
  const deps: ModDeps = { out, records, words: () => testWords, alerts: { alert: (a) => void alerts.push(a) }, recentIds: () => [], bot: () => "TonkfunBot", now: at };
  return { out, records, alerts, deps };
}

const target = (over: Partial<ModTarget> = {}): ModTarget => ({
  chat: GROUP_ID, user: MEMBER.id, senderChat: null, messageIds: [42], name: "Sam", username: "sam", lang: "en", excerpt: "", link: null, ageSeconds: 3, ...over,
});
const decision = (over: Partial<Decision>): Decision => ({ actions: [], category: "lookalike", source: "rule", offence: "none", notice: null, alert: null, observeOnly: false, ...over });
const scamMute = decision({ actions: [{ kind: "delete" }, { kind: "mute", seconds: DAY }], offence: "certain", notice: "muted", alert: "action" });
const ban = decision({ actions: [{ kind: "delete" }, { kind: "ban" }], offence: "certain", notice: "banned", alert: "action" });

/** A restriction Telegram answers only when release() is called (a slow or rate-limited call). */
function slowRestrict() {
  let release = () => undefined as void;
  const answer = new Promise<boolean>((resolve) => (release = () => resolve(true)));
  return { restrict: () => answer, release: () => release() };
}

describe("applyDecision: deletes never wait on sanctions", () => {
  it("deletes every scam at once while an earlier member's mute is still waiting on Telegram", async () => {
    const slow = slowRestrict();
    const { out, deps } = setup({ restrict: slow.restrict });
    const runs = [301, 302, 303].map((user, i) => applyDecision(scamMute, target({ user, messageIds: [100 + i] }), deps));
    await flush();
    expect(callsOf(out.log, "remove")).toEqual([[GROUP_ID, [100]], [GROUP_ID, [101]], [GROUP_ID, [102]]]);
    // Each member's sanction goes out on its own: one slow call holds up nobody else's.
    expect(callsOf(out.log, "restrict").map((c) => c[1])).toEqual([301, 302, 303]);
    slow.release();
    await Promise.all(runs);
  });

  it("keeps one member's sanctions, notices and alerts in order", async () => {
    const slow = slowRestrict();
    const { out, alerts, deps } = setup({ restrict: slow.restrict });
    const first = applyDecision(scamMute, target({ messageIds: [1] }), deps);
    const second = applyDecision(ban, target({ messageIds: [2] }), deps);
    await flush();
    expect(callsOf(out.log, "remove")).toEqual([[GROUP_ID, [1]], [GROUP_ID, [2]]]);
    expect(callsOf(out.log, "ban")).toEqual([]);
    slow.release();
    await Promise.all([first, second]);
    expect(callsOf(out.log, "ban")).toEqual([[GROUP_ID, MEMBER.id]]);
    expect(alerts.map((a) => a.undo)).toEqual(["mute", "ban"]);
  });

  it("never rejects, even when a call throws", async () => {
    const broken = setup({ ban: () => Promise.reject(new Error("boom")) });
    await expect(applyDecision(ban, target(), broken.deps)).resolves.toBeUndefined();
    expect(callsOf(broken.out.log, "remove")).toEqual([[GROUP_ID, [42]]]);
  });
});

describe("applyDecision: no record for someone who is gone", () => {
  it("records no offence when the member was banned or removed", async () => {
    const banned = setup();
    await applyDecision(ban, target(), banned.deps);
    expect(banned.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
    const kicked = setup();
    await applyDecision(decision({ actions: [{ kind: "delete" }, { kind: "kick" }], category: "name_link", offence: "certain", alert: "action" }), target(), kicked.deps);
    expect(kicked.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
    // A ban Telegram refused leaves the member in the group: the offence counts.
    const refused = setup({ ban: async () => false });
    await applyDecision(ban, target(), refused.deps);
    expect(refused.records.offences(GROUP_ID, MEMBER.id, NOW)).toMatchObject({ n: 1, certain: 1 });
  });

  it("records no offence from a late verdict when the member left after posting, but does after a rejoin", async () => {
    let now = NOW;
    const { records, deps } = setup({}, () => now);
    const spam = decision({ actions: [{ kind: "delete" }, { kind: "warn" }], category: "model_spam", source: "model", offence: "model", notice: "warned", alert: "action" });
    noteLeft(records, GROUP_ID, MEMBER.id, NOW + 5_000);
    now = NOW + 12_000;
    await applyDecision(spam, target({ seenAt: NOW }), deps);
    expect(records.offences(GROUP_ID, MEMBER.id, now).n).toBe(0);
    // Back in the group, a new message's offence counts.
    await applyDecision(spam, target({ seenAt: NOW + 8_000 }), deps);
    expect(records.offences(GROUP_ID, MEMBER.id, now).n).toBe(1);
  });

  it("forgets who left after 10 minutes, and keeps each group's and each records' apart", () => {
    const records = memoryRecords({ strictness: "normal" });
    const other = memoryRecords({ strictness: "normal" });
    noteLeft(records, GROUP_ID, MEMBER.id, NOW);
    expect(leftSince(records, GROUP_ID, MEMBER.id, NOW - 1, NOW + MINUTE)).toBe(true);
    expect(leftSince(records, GROUP_ID, MEMBER.id, NOW + 1, NOW + MINUTE)).toBe(false);
    expect(leftSince(records, GROUP_ID - 1, MEMBER.id, NOW - 1, NOW + MINUTE)).toBe(false);
    expect(leftSince(other, GROUP_ID, MEMBER.id, NOW - 1, NOW + MINUTE)).toBe(false);
    expect(leftSince(records, GROUP_ID, MEMBER.id, NOW - 1, NOW + 10 * MINUTE)).toBe(false);
  });
});
