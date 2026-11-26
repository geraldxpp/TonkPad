import { describe, expect, it } from "vitest";
import { callsOf, groupMessage } from "./community-fixtures";
import { PRIVATE, REPORTER, SEED, sends, setup } from "./community-report-fixtures";

describe("/report in a private chat", () => {
  const privately = (text: string) => groupMessage(`/report ${text}`, { from: REPORTER, chat: PRIVATE });

  it("shares the member's name, username and words with the team, without their ID", async () => {
    const s = setup();
    expect(await s.reports.onPrivateReport(privately("x"), "  Someone called TonkSupport DMed me  ")).toBe(true);
    expect(s.alerts).toEqual([{
      chat: null,
      kind: "scam_report",
      category: "scam_report",
      member: { id: null, name: "Rae Porter", username: "rae_p", since: null },
      excerpt: "Someone called TonkSupport DMed me",
      link: null,
      done: null,
      aiGuess: null,
      undo: null,
      messageId: null,
      routine: false,
      urgent: false,
    }]);
    expect(sends(s.out)).toEqual([[REPORTER.id, "Thanks. The team will take a look.", { kind: "answer" }]]);
  });

  it("points to the Security page when there is no admin chat", async () => {
    const s = setup({ alerts: null });
    expect(await s.reports.onPrivateReport(privately("x"), "A scam account")).toBe(true);
    expect(sends(s.out)).toEqual([[REPORTER.id, "Reports aren't set up yet.", { kind: "answer" }]]);
  });

  it("removes a recovery phrase and shares nothing", async () => {
    const s = setup();
    const m = privately(SEED);
    expect(await s.reports.onPrivateReport(m, SEED)).toBe(true);
    expect(s.alerts).toEqual([]);
    expect(callsOf(s.out.log, "remove")).toEqual([[REPORTER.id, [m.message_id]]]);
    expect(sends(s.out)[0][1]).toBe("Never send a recovery phrase or key to anyone, me included.");
  });

  it("paces private reports too, and leaves an empty one to the caller", async () => {
    const s = setup();
    for (let i = 0; i < 4; i += 1) await s.reports.onPrivateReport(privately("x"), "A scam account");
    expect(s.alerts).toHaveLength(3);
    expect(sends(s.out).at(-1)?.[1]).toBe("Please wait a few minutes before reporting again.");
    expect(await s.reports.onPrivateReport(privately(""), "   ")).toBe(false);
  });
});
