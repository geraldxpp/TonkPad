import { describe, expect, it } from "vitest";
import type { AiLimits } from "../src/telegram/claude/types";
import { createAlerts } from "../src/telegram/community/alerts";
import { createReports } from "../src/telegram/community/report";
import type { AdminAlert } from "../src/telegram/community/types";
import { en } from "../src/telegram/i18n/community/en";
import type { TgUser } from "../src/telegram/types";
import { ADMIN_CHAT_ID, callsOf, fakeAdmins, GROUP_ID, groupMessage, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";

/** /report with the real English words (words#3), and a reporter's reason on its own line (words#6). */

const REPORTER: TgUser = { id: 301, is_bot: false, first_name: "Rae", username: "rae_p", language_code: "en" };
const SCAMMER: TgUser = { id: 302, is_bot: false, first_name: "Scam" };
const limits: AiLimits = { answer: () => "ok", proactive: () => true, triage: () => true, report: () => true, press: () => true, coolDown: () => false, busyReply: () => true, prune: () => undefined };

describe("/report in a group, in English", () => {
  it("asks for a reply when it replies to nothing, never to write what happened, and sends the admins nothing", async () => {
    const out = recordOut();
    const alerts: AdminAlert[] = [];
    const reports = createReports({ out, admins: fakeAdmins(), limits, alerts: { alert: (a) => void alerts.push(a) }, words: () => en, now: () => NOW });
    await reports.onGroupReport(groupMessage("/report someone keeps insulting people in the trading topic", { from: REPORTER }), "someone keeps insulting people in the trading topic");
    const [[, note]] = callsOf(out.log, "send") as [[number, string]];
    expect(note).toBe(en.report.usage);
    expect(note).not.toBe(en.report.usagePrivate);
    expect(note).toMatch(/^Reply to the message/);
    expect(alerts).toEqual([]);
  });
});

describe("a reporter's reason", () => {
  it("reaches the admins under its own label, never as what the bot did", async () => {
    const out = recordOut();
    const alerts = createAlerts({ out, records: memoryRecords(), adminChat: ADMIN_CHAT_ID, words: testWords, now: () => NOW, groupTitle: () => "Community" });
    const reports = createReports({ out, admins: fakeAdmins(), limits, alerts, words: () => testWords, now: () => NOW });
    const scam = groupMessage("Claim your airdrop now", { from: SCAMMER });
    await reports.onGroupReport(groupMessage("/report", { from: REPORTER, reply_to_message: scam }), "already banned by the bot, nothing to do");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const html = callsOf(out.log, "send").find((args) => args[0] === ADMIN_CHAT_ID)?.[1] as string;
    expect(html.split("\n")).toContain("Reason given: already banned by the bot, nothing to do");
    expect(html).not.toContain("Done");
    expect(callsOf(out.log, "send").filter((args) => args[0] === GROUP_ID)).toHaveLength(1);
  });
});
