import { describe, expect, it } from "vitest";
import { createAlerts } from "../src/telegram/community/alerts";
import { createReports } from "../src/telegram/community/report";
import type { TgChat, TgMessage } from "../src/telegram/types";
import { ADMIN_CHAT_ID, actionsOf, BOT, callsOf, fakeAdmins, GROUP, GROUP_ID, groupMessage, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { ADMIN, countingLimits, report, REPORTER, SEED, sends, setup, spam, SPAMMER } from "./community-report-fixtures";
import { NOW } from "./fixtures";

describe("/report in a group", () => {
  it("tells a reporter who replied to nothing how to report, for 30 seconds", async () => {
    const s = setup();
    const m = report(undefined);
    await s.reports.onGroupReport(m, "");
    expect(callsOf(s.out.log, "remove")).toEqual([[GROUP_ID, [m.message_id]]]);
    expect(sends(s.out)).toEqual([[GROUP_ID, "Reply to a message with /report.", { kind: "notice", thread: undefined, ephemeralTo: REPORTER.id }]]);
    expect(callsOf(s.out.log, "removeLater")).toEqual([[GROUP_ID, 5001, 30_000]]);
    expect(s.alerts).toEqual([]);
  });

  it("counts a reply to a topic's root as no reply", async () => {
    const s = setup();
    const root: TgMessage = { message_id: 40, date: 0, chat: GROUP, forum_topic_created: {} };
    await s.reports.onGroupReport(report(root, { is_topic_message: true, message_thread_id: 40 }), "");
    expect(sends(s.out)[0][1]).toBe("Reply to a message with /report.");
    expect(sends(s.out)[0][2]).toMatchObject({ thread: 40 });
    expect(s.alerts).toEqual([]);
  });

  it("sends the admins the message, who wrote it and who reported it, and acts on nobody", async () => {
    const s = setup();
    const reported = spam();
    const m = report(reported);
    await s.reports.onGroupReport(m, "scam link");
    expect(s.alerts).toEqual([{
      chat: GROUP_ID,
      kind: "report",
      category: "reported",
      member: { id: SPAMMER.id, name: "Spam", username: "free_coins", since: null },
      reporter: { id: REPORTER.id, name: "Rae Porter", username: "rae_p" },
      excerpt: "Free coins at claim-tonkfun.xyz, DM me",
      link: `https://t.me/c/1234567890/${reported.message_id}`,
      done: null,
      reason: "scam link",
      aiGuess: null,
      undo: null,
      messageId: reported.message_id,
      routine: false,
      urgent: false,
    }]);
    // The command goes, the thanks comes (never as a reply, which would notify the reported member), and nothing else happens.
    expect(actionsOf(s.out.log).map((c) => c.op)).toEqual(["remove", "send", "removeLater"]);
    expect(callsOf(s.out.log, "remove")).toEqual([[GROUP_ID, [m.message_id]]]);
    expect(sends(s.out)).toEqual([[GROUP_ID, "Thanks. An admin will take a look.", { kind: "notice", thread: undefined, ephemeralTo: REPORTER.id }]]);
    expect(callsOf(s.out.log, "removeLater")).toEqual([[GROUP_ID, 5001, 30_000]]);
    expect(s.records.counts(GROUP_ID, NOW).reports).toBe(1);
  });

  it("gives the alert Delete and Mute 1 h buttons in the admin chat", async () => {
    const out = recordOut();
    const alerts = createAlerts({ out, records: memoryRecords(), adminChat: ADMIN_CHAT_ID, words: testWords, now: () => NOW, groupTitle: () => "Community" });
    const reports = createReports({ out, admins: fakeAdmins(), limits: countingLimits(), alerts, words: () => testWords, now: () => NOW });
    const reported = spam();
    await reports.onGroupReport(report(reported), "");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const alert = sends(out).find((args) => args[0] === ADMIN_CHAT_ID);
    const keyboard = (alert?.[2] as { keyboard?: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> } }).keyboard;
    const buttons = keyboard?.inline_keyboard.flat() ?? [];
    expect(buttons.map((b) => b.callback_data ?? b.url)).toEqual([
      `https://t.me/c/1234567890/${reported.message_id}`,
      `x:d:${GROUP_ID}:${reported.message_id}`,
      `x:q:${GROUP_ID}:${SPAMMER.id}`,
      "x:h:-1001234567890:0",
    ]);
    // The reporter on a line of their own under the member; with no reason given, no reason line, and never a "done" line.
    expect((alert?.[1] as string).split("\n").slice(1, 4)).toEqual(["Member: Spam · <code>free_coins</code> · <code>302</code>", "Reported by: Rae Porter · <code>rae_p</code> · <code>301</code>", "Message: Free coins at claim-tonkfun·xyz, DM me"]);
    expect(alert?.[1]).not.toContain("Done");
    expect(alert?.[1]).not.toContain("Reason given");
    expect(callsOf(out.log, "restrict")).toEqual([]);
  });

  it("takes 3 reports per person, then says to slow down once", async () => {
    const s = setup();
    for (let i = 0; i < 5; i += 1) await s.reports.onGroupReport(report(spam()), "");
    expect(s.alerts).toHaveLength(3);
    expect(sends(s.out).map((args) => args[1])).toEqual([...Array(3).fill("Thanks. An admin will take a look."), "Please wait a few minutes before reporting again."]);
    expect(callsOf(s.out.log, "remove")).toHaveLength(5);
  });

  it("ignores reports on admins, bots, the group itself and oneself", async () => {
    const targets = [
      groupMessage("I'm an admin", { from: ADMIN }),
      groupMessage("A card", { from: BOT }),
      groupMessage("Pinned news", { from: { id: 1_087_968_824, is_bot: true, first_name: "Group" }, sender_chat: GROUP }),
      groupMessage("A channel post", { from: { id: 777_000, is_bot: false, first_name: "Telegram" }, is_automatic_forward: true, sender_chat: { id: -1001111111111, type: "channel" } }),
      groupMessage("My own words", { from: REPORTER }),
    ];
    for (const target of targets) {
      const s = setup();
      const m = report(target);
      await s.reports.onGroupReport(m, "");
      expect(s.alerts).toEqual([]);
      expect(actionsOf(s.out.log)).toEqual([{ op: "remove", args: [GROUP_ID, [m.message_id]] }]);
      expect(s.records.counts(GROUP_ID, NOW).reports).toBe(0);
    }
  });

  it("ignores an anonymous admin's /report, deleting it", async () => {
    const s = setup();
    const m = report(spam(), { from: { id: 1_087_968_824, is_bot: true, first_name: "Group" }, sender_chat: GROUP });
    await s.reports.onGroupReport(m, "");
    expect(s.alerts).toEqual([]);
    expect(actionsOf(s.out.log)).toEqual([{ op: "remove", args: [GROUP_ID, [m.message_id]] }]);
  });

  it("reports someone posting as a channel by the channel, with nobody to mute", async () => {
    const s = setup();
    const channel: TgChat = { id: -1002222222222, type: "channel", title: "Airdrop Bot", username: "airdrop_now" };
    await s.reports.onGroupReport(report(groupMessage("Claim now", { from: { id: 136_817_688, is_bot: true, first_name: "Channel" }, sender_chat: channel })), "");
    expect(s.alerts[0].member).toEqual({ id: null, name: "Airdrop Bot", username: "airdrop_now", since: null });
  });

  it("never puts a recovery phrase in the excerpt or the reason, and keeps a reason cleaned and cut to 100 characters", async () => {
    const s = setup();
    await s.reports.onGroupReport(report(groupMessage(SEED, { from: SPAMMER })), SEED);
    await s.reports.onGroupReport(report(spam()), `  fake   airdrop\u200b link ${"x".repeat(120)}`);
    expect(s.alerts.map((a) => [a.excerpt === null, a.reason, a.done, a.reporter?.id])).toEqual([[true, null, null, REPORTER.id], [false, `fake airdrop link ${"x".repeat(82)}`, null, REPORTER.id]]);
  });
});
