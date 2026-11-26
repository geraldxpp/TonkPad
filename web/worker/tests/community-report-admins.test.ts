import { describe, expect, it } from "vitest";
import { createReports } from "../src/telegram/community/report";
import type { AdminAlert } from "../src/telegram/community/types";
import type { TgMessage, TgUser } from "../src/telegram/types";
import { adminInfo, callsOf, fakeAdmins, GROUP_ID, groupMessage, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { countingLimits, PRIVATE, report, REPORTER } from "./community-report-fixtures";
import { NOW } from "./fixtures";

const HELPER: TgUser = { id: 310, is_bot: false, first_name: "Helper" };
const MOD: TgUser = { id: 311, is_bot: false, first_name: "Mod" };
const CREATOR: TgUser = { id: 312, is_bot: false, first_name: "Founder" };

/** Reports in a group whose admins are a title-only helper, a moderator who can delete, and the creator with no listed rights. */
function bench(ready?: () => boolean) {
  const out = recordOut();
  const alerts: AdminAlert[] = [];
  const admins = fakeAdmins({
    [GROUP_ID]: [adminInfo(HELPER.id, { canDelete: false, canRestrict: false }), adminInfo(MOD.id, { canRestrict: false }), adminInfo(CREATOR.id, { creator: true, canDelete: false, canRestrict: false })],
  });
  const reports = createReports({ out, records: memoryRecords(), admins, limits: countingLimits(10), alerts: { alert: (a) => void alerts.push(a) }, words: () => testWords, now: () => NOW, ready });
  const notes = () => callsOf(out.log, "send").map((args) => args[1]);
  return { out, alerts, reports, notes };
}

const giveaway = (from: TgUser): TgMessage => groupMessage("Giveaway from the team: send 0.1 ETH to 0x2222222222222222222222222222222222222222 and get 0.2 back within minutes", { from });

describe("/report on an administrator (admin-privacy-docs#5)", () => {
  it("reaches the admins when the reported account is an admin with a title only, and thanks the reporter", async () => {
    const b = bench();
    await b.reports.onGroupReport(report(giveaway(HELPER)), "");
    expect(b.alerts.map((a) => [a.kind, a.member?.id])).toEqual([["report", HELPER.id]]);
    expect(b.notes()).toEqual([testWords.report.thanks]);
  });

  it("still ignores a report on a real admin: the creator, or an admin who can delete or ban", async () => {
    for (const admin of [MOD, CREATOR]) {
      const b = bench();
      await b.reports.onGroupReport(report(giveaway(admin)), "");
      expect(b.alerts).toEqual([]);
      expect(b.notes()).toEqual([]);
    }
  });
});

describe("/report while the admin chat hasn't passed its checks (wiring#2)", () => {
  it("tells a group reporter reports aren't set up yet, sends the admins nothing and counts nothing", async () => {
    const records = memoryRecords();
    const out = recordOut();
    const alerts: AdminAlert[] = [];
    const reports = createReports({ out, records, admins: fakeAdmins(), limits: countingLimits(), alerts: { alert: (a) => void alerts.push(a) }, words: () => testWords, now: () => NOW, ready: () => false });
    await reports.onGroupReport(report(giveaway({ id: 320, is_bot: false, first_name: "Spam" })), "scam");
    expect(alerts).toEqual([]);
    expect(callsOf(out.log, "send").map((args) => args[1])).toEqual([testWords.report.noAdminChat]);
    expect(records.counts(GROUP_ID, NOW).reports).toBe(0);
  });

  it("tells a private reporter the same, and sends nothing", async () => {
    const b = bench(() => false);
    const m: TgMessage = { message_id: 9, date: Math.floor(NOW / 1000), chat: PRIVATE, from: REPORTER, text: "/report someone DMed me asking for my seed" };
    expect(await b.reports.onPrivateReport(m, "someone DMed me asking for my seed")).toBe(true);
    expect(b.alerts).toEqual([]);
    expect(b.notes()).toEqual([testWords.report.noAdminChat]);
  });

  it("thanks again once the admin chat passed", async () => {
    let ready = false;
    const b = bench(() => ready);
    ready = true;
    await b.reports.onGroupReport(report(giveaway({ id: 321, is_bot: false, first_name: "Spam" })), "");
    expect(b.alerts).toHaveLength(1);
    expect(b.notes()).toEqual([testWords.report.thanks]);
  });
});
