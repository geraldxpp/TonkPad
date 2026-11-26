import { describe, expect, it } from "vitest";
import type { CommunityOut } from "../src/telegram/community/out";
import type { AdminAlert, Decision, RuleCategory } from "../src/telegram/community/types";
import { applyDecision, type ModDeps, type ModTarget } from "../src/telegram/mod/actions";
import { durationText, mentions, notice } from "../src/telegram/mod/notices";
import type { InlineKeyboard } from "../src/telegram/types";
import { actionsOf, callsOf, GROUP_ID, MEMBER, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";

const DAY = 86_400;
const SITE = "https://www.tonkfun.fun";
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(overrides: Partial<CommunityOut> = {}, recent: number[] = []) {
  const out = recordOut(overrides);
  const records = memoryRecords({ strictness: "normal" });
  const alerts: AdminAlert[] = [];
  const deps: ModDeps = { out, records, words: () => testWords, alerts: { alert: (a) => void alerts.push(a) }, recentIds: () => recent, bot: () => "TonkfunBot", now: () => NOW, site: SITE };
  return { out, records, alerts, deps };
}

const target = (over: Partial<ModTarget> = {}): ModTarget => ({
  chat: GROUP_ID, user: MEMBER.id, senderChat: null, messageIds: [42], name: "Sam Scammer", username: "samscam", lang: "en",
  excerpt: "claim your airdrop at tonkfun-airdrop dot xyz", link: "https://t.me/c/1234567890/42", ageSeconds: 3, ...over,
});

const decision = (over: Partial<Decision>): Decision => ({ actions: [], category: "lookalike", source: "rule", offence: "none", notice: null, alert: null, observeOnly: false, ...over });
const scamMute = decision({ actions: [{ kind: "delete" }, { kind: "mute", seconds: DAY }], offence: "certain", notice: "muted", alert: "action" });

describe("applyDecision", () => {
  it("deletes, restricts with every permission off until 24 hours from the call, counts, notices and alerts, in that order", async () => {
    const { out, records, alerts, deps } = setup();
    await applyDecision(scamMute, target(), deps);
    await flush();
    expect(actionsOf(out.log).map((c) => c.op)).toEqual(["remove", "restrict", "send", "removeLater"]);
    const [chat, user, permissions, until] = callsOf(out.log, "restrict")[0] as [number, number, Record<string, boolean>, number];
    expect([chat, user, until]).toEqual([GROUP_ID, MEMBER.id, Math.floor(NOW / 1000) + DAY]);
    expect(Object.keys(permissions)).toHaveLength(16);
    expect(Object.values(permissions).every((v) => v === false)).toBe(true);
    expect(records.offences(GROUP_ID, MEMBER.id, NOW)).toMatchObject({ n: 1, certain: 1, category: "lookalike" });
    expect(records.counts(GROUP_ID, NOW)).toMatchObject({ removed: 1, muted: 1 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "action", category: "lookalike", undo: "mute", member: { id: MEMBER.id, name: "Sam Scammer" }, excerpt: target().excerpt, messageId: 42, routine: true });
    expect(alerts[0].done).toBe("Member can't post for 24 hours. Reason: lookalike.");
  });

  it("names nobody in the notice, mentions the member by a fixed word, offers a review and deletes it after a minute", async () => {
    const { out, deps } = setup();
    await applyDecision(scamMute, target(), deps);
    await flush();
    const [chat, html, options] = callsOf(out.log, "send")[0] as [number, string, { kind: string; ephemeralTo?: number; keyboard?: InlineKeyboard }];
    expect(chat).toBe(GROUP_ID);
    expect(html).toBe(`<a href="tg://user?id=${MEMBER.id}">newcomer</a> can't post for 24 hours. Reason: lookalike.`);
    expect(html).not.toMatch(/Sam|samscam/);
    expect(options).toMatchObject({ kind: "notice", ephemeralTo: MEMBER.id });
    expect(options.keyboard?.inline_keyboard).toEqual([[{ text: "Why? Ask for a review", url: "https://t.me/TonkfunBot?start=appeal" }]]);
    expect(callsOf(out.log, "removeLater")).toEqual([[GROUP_ID, 5001, 60_000]]);
  });

  it("records offences with their certain flag", async () => {
    const { records, deps } = setup();
    await applyDecision(decision({ actions: [{ kind: "delete" }, { kind: "warn" }], category: "model_spam", source: "model", offence: "model", notice: "warned", alert: "action" }), target(), deps);
    expect(records.offences(GROUP_ID, MEMBER.id, NOW)).toMatchObject({ n: 1, certain: 0, category: "model_spam" });
  });

  it("removes with one kick call, never a ban", async () => {
    const { out, records, deps } = setup();
    await applyDecision(decision({ actions: [{ kind: "delete" }, { kind: "kick" }], category: "name_link", notice: "banned", alert: "action" }), target(), deps);
    expect(callsOf(out.log, "kick")).toEqual([[GROUP_ID, MEMBER.id]]);
    expect(callsOf(out.log, "ban")).toEqual([]);
    expect(records.counts(GROUP_ID, NOW).kicked).toBe(1);
  });

  it("on a ban also deletes the member's messages from the last 10 minutes", async () => {
    const { out, alerts, deps } = setup({}, [7, 8, 42]);
    await applyDecision(decision({ actions: [{ kind: "delete" }, { kind: "ban" }], offence: "certain", notice: "banned", alert: "action" }), target({ messageIds: [42] }), deps);
    expect(callsOf(out.log, "remove")).toEqual([[GROUP_ID, [42, 7, 8]]]);
    expect(alerts[0].undo).toBe("ban");
  });

  it("offers Ban when Haiku's verdict alone stopped at a 24-hour mute, and keeps that alert", async () => {
    const { alerts, deps } = setup();
    const model = { ...scamMute, category: "model_scam" as const, source: "model" as const, offence: "model" as const, aiGuess: "Fake airdrop." };
    await applyDecision(model, target(), deps);
    expect(alerts[0]).toMatchObject({ kind: "action", undo: "mute", aiGuess: "Fake airdrop.", routine: false });
  });

  it("doesn't claim a mute that Telegram refused", async () => {
    const { out, records, alerts, deps } = setup({ restrict: async () => false });
    await applyDecision(scamMute, target(), deps);
    await flush();
    expect(callsOf(out.log, "send")[0][1]).toBe(`<a href="tg://user?id=${MEMBER.id}">newcomer</a>: a message was removed. Reason: lookalike.`);
    expect(records.counts(GROUP_ID, NOW).muted).toBe(0);
    expect(alerts[0]).toMatchObject({ undo: null, done: "Member: a message was removed. Reason: lookalike." });
  });

  it("mutes the author of a message too old to delete, makes no delete call and asks admins to delete it", async () => {
    const { out, alerts, deps } = setup();
    await applyDecision(decision({ actions: [{ kind: "delete" }, { kind: "warn" }], category: "risky_file", offence: "model", notice: "warned", alert: "action" }), target({ ageSeconds: 48 * 3600 }), deps);
    expect(callsOf(out.log, "remove")).toEqual([]);
    expect(callsOf(out.log, "restrict")[0][3]).toBe(Math.floor(NOW / 1000) + DAY);
    expect(alerts[0]).toMatchObject({ undo: "mute", routine: false });
    expect(alerts[0].done).toBe(`Member can't post for 24 hours. Reason: risky_file. ${testWords.admin.byHand}`);
    // A secret is never an offence: nobody is muted for it, and the admins are told to delete it themselves.
    const quiet = setup();
    await applyDecision(decision({ actions: [{ kind: "delete" }], category: "secret", notice: "secret", alert: "secret" }), target({ ageSeconds: 48 * 3600 }), quiet.deps);
    expect(actionsOf(quiet.out.log)).toEqual([]);
    expect(quiet.alerts[0]).toMatchObject({ kind: "secret", excerpt: null, routine: false, done: testWords.admin.byHand });
    // A message young enough to delete never asks for it.
    const young = setup();
    await applyDecision(decision({ actions: [{ kind: "delete" }, { kind: "warn" }], category: "risky_file", offence: "model", notice: "warned", alert: "action" }), target({ ageSeconds: 47 * 3600 }), young.deps);
    expect(callsOf(young.out.log, "remove")).toEqual([[GROUP_ID, [42]]]);
    expect(young.alerts[0].done).toBe("Member: a warning. Reason: risky_file.");
  });

  it("tells the admins a scam ban leaves older messages, but not another ban, a ban that didn't take or a channel's", async () => {
    const ban = (category: RuleCategory) => decision({ actions: [{ kind: "delete" }, { kind: "ban" }], category, offence: "certain", notice: "banned", alert: "action" });
    const scam = setup({}, [7]);
    await applyDecision(ban("phishing"), target(), scam.deps);
    expect(callsOf(scam.out.log, "remove")).toEqual([[GROUP_ID, [42, 7]]]);
    expect(scam.alerts[0].done).toBe(`Member was removed from the group. Reason: phishing. ${testWords.admin.olderMessages}`);
    const ladder = setup();
    await applyDecision(ban("flood"), target(), ladder.deps);
    expect(ladder.alerts[0].done).toBe("Member was removed from the group. Reason: flood.");
    const refused = setup({ ban: async () => false });
    await applyDecision(ban("lookalike"), target(), refused.deps);
    expect(refused.alerts[0].done).toBe("Member: a message was removed. Reason: lookalike.");
    const channel = setup();
    await applyDecision(decision({ actions: [{ kind: "delete" }, { kind: "ban_sender_chat" }], notice: "banned", alert: "action" }), target({ user: null, senderChat: -1005555 }), channel.deps);
    expect(channel.alerts[0].done).toBe("Member was removed from the group. Reason: lookalike.");
  });

  it("sends secrets and flaw reports to the admins without text, the flaw notice with the Security button", async () => {
    const { out, alerts, records, deps } = setup();
    await applyDecision(decision({ actions: [{ kind: "delete" }], category: "security_report", notice: "flaw", alert: "security" }), target(), deps);
    await flush();
    expect(alerts[0]).toMatchObject({ kind: "security", excerpt: null, routine: false });
    const keyboard = (callsOf(out.log, "send")[0][2] as { keyboard: InlineKeyboard }).keyboard;
    expect(keyboard.inline_keyboard[0]).toEqual([{ text: "Security", url: `${SITE}/security` }]);
    expect(records.counts(GROUP_ID, NOW).escalated).toBe(1);
    expect(records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
  });

  it("bans a channel identity by its ID and mentions nobody", async () => {
    const { out, deps } = setup();
    await applyDecision(decision({ actions: [{ kind: "delete" }, { kind: "ban_sender_chat" }], notice: "banned", alert: "action" }), target({ user: null, senderChat: -1005555 }), deps);
    await flush();
    expect(callsOf(out.log, "banSenderChat")).toEqual([[GROUP_ID, -1005555]]);
    expect(callsOf(out.log, "send")).toEqual([]);
  });

  it("replies to a kept scam report, and uses the link note for an unknown link", async () => {
    const report = setup();
    await applyDecision(decision({ actions: [], category: "scam_report", notice: "scam_report", alert: "scam_report" }), target(), report.deps);
    await flush();
    expect(callsOf(report.out.log, "send")[0][1]).toBe("That account isn't us. The team never DMs first.");
    expect((callsOf(report.out.log, "send")[0][2] as { replyTo?: number }).replyTo).toBe(42);
    const link = setup();
    await applyDecision(decision({ actions: [{ kind: "delete" }], category: "unknown_link", notice: "removed" }), target(), link.deps);
    await flush();
    expect(callsOf(link.out.log, "send")[0][1]).toContain("a link was removed");
    expect(link.alerts).toEqual([]);
  });

  it("deletes at once, runs one member's sanctions in order, and survives a failing call", async () => {
    let release = () => undefined as void;
    const slow = new Promise<boolean>((resolve) => (release = () => resolve(true)));
    const { out, deps } = setup({ restrict: () => slow });
    const first = applyDecision(scamMute, target({ messageIds: [1] }), deps);
    const second = applyDecision(decision({ actions: [{ kind: "delete" }], notice: "removed" }), target({ messageIds: [2] }), deps);
    await flush();
    // The second delete never waits on the first mute (mod-actions-queue.test.ts has more); its notice does.
    expect(callsOf(out.log, "remove")).toEqual([[GROUP_ID, [1]], [GROUP_ID, [2]]]);
    expect(callsOf(out.log, "send")).toEqual([]);
    release();
    await Promise.all([first, second]);
    await flush();
    expect(callsOf(out.log, "send")).toHaveLength(2);
    const broken = setup({ ban: () => Promise.reject(new Error("boom")) });
    await expect(applyDecision(decision({ actions: [{ kind: "ban" }] }), target(), broken.deps)).resolves.toBeUndefined();
  });
});

describe("notices", () => {
  it("mentions with a fixed word, at most three links, then the rest as a count", () => {
    const others = (n: number) => `and ${n} more`;
    expect(mentions([{ id: 1 }], "member", others)).toBe('<a href="tg://user?id=1">member</a>');
    const five = mentions([1, 2, 3, 4, 5, 2].map((id) => ({ id })), "<b>", others);
    expect(five.match(/tg:\/\/user/g)).toHaveLength(3);
    expect(five).toBe('<a href="tg://user?id=1">&lt;b&gt;</a>, <a href="tg://user?id=2">&lt;b&gt;</a>, <a href="tg://user?id=3">&lt;b&gt;</a> and 2 more');
  });

  it("writes durations in whole units", () => {
    expect([180, 600, 3600, DAY, 7 * DAY].map((s) => durationText(s, testWords, "en"))).toEqual(["3 minutes", "10 minutes", "1 hour", "24 hours", "7 days"]);
  });

  it("fills a notice's reason and never prints a name", async () => {
    const { out, deps } = setup();
    notice("warned", target({ name: "Alex <Admin>" }), deps, { reason: "Reason: test." });
    await flush();
    expect(callsOf(out.log, "send")[0][1]).toBe(`<a href="tg://user?id=${MEMBER.id}">newcomer</a>: a warning. Reason: test.`);
  });
});
