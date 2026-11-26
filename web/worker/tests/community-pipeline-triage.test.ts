// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MUTED } from "../src/telegram/community/permissions";
import { callsOf, failure, groupMessage, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";
import { DAY, GROUP_ID, harness, person, S, scripted, settle, testWords, verdict } from "./community-pipeline-fixtures";

const UNKNOWN_LINK = "check out coolcoin.xyz for gains";

/** Haiku's check in the pipeline: what its verdict adds to the rules' decision, and what happens when there is none. */
describe("the community pipeline: Haiku's check", () => {
  it("deletes a member's unknown link with a note in normal mode, and lets the check decide the offence", async () => {
    const h = harness({ client: scripted({ triage: verdict({ verdict: "spam", category: "link_spam", question: "none", reason: "Promotes another coin" }) }) });
    const m = groupMessage(UNKNOWN_LINK);
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(h.sends().map((s) => s[1])).toEqual([
      testWords.mod.linkRemoved.replace("{mentions}", `<a href="tg://user?id=${MEMBER.id}">${testWords.check.member}</a>`),
      `${testWords.mod.warned.replace("{mentions}", `<a href="tg://user?id=${MEMBER.id}">${testWords.check.member}</a>`).replace("{reason}", testWords.mod.reasons.model_spam)}`,
    ]);
    expect(h.records.offences(GROUP_ID, MEMBER.id, NOW)).toMatchObject({ n: 1, certain: 0 });
    // The removal reaches the team as a routine note (words#5), the check's warning as an alert of its own.
    expect(h.alerts.map((a) => [a.kind, a.category, a.aiGuess, a.undo, a.routine])).toEqual([
      ["action", "unknown_link", null, null, true],
      ["action", "model_spam", "Promotes another coin", "warn", true],
    ]);
    expect(h.kinds()).toEqual(["triage"]);
  });

  it("mutes for 24 hours and alerts on a scam verdict", async () => {
    const h = harness({ client: scripted({ triage: verdict({ verdict: "scam", category: "phishing", question: "none", reason: "Doubling scam" }) }) });
    const m = groupMessage("Send 0.1 ETH to 0x2222222222222222222222222222222222222222 and get 1 ETH back");
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "restrict")).toEqual([[GROUP_ID, MEMBER.id, MUTED, Math.floor(NOW / 1000) + DAY / 1000]]);
    expect(h.alerts.map((a) => [a.kind, a.category])).toEqual([["action", "model_scam"]]);
    expect(callsOf(h.out.log, "ban")).toEqual([]);
  });

  it("keeps the rules' decision when the check fails", async () => {
    const h = harness({ client: scripted({ triage: failure("timeout") }) });
    const m = groupMessage(UNKNOWN_LINK);
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(h.sends()).toHaveLength(1);
    expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(h.budget?.failures).toEqual(["timeout"]);
  });

  it("holds a member's unknown link in relaxed mode when the check can't run", async () => {
    for (const client of [scripted({ triage: failure("overloaded", 529) }), null]) {
      const h = harness({ mode: "relaxed", client });
      const m = groupMessage(UNKNOWN_LINK);
      await h.send(m);
      await settle();
      expect(h.removed()).toEqual([m.message_id]);
      expect(h.records.counts(GROUP_ID, NOW).held).toBe(1);
      expect(h.alerts.map((a) => [a.kind, a.category])).toEqual([["action", "unknown_link"]]);
    }
  });

  it("leaves a relaxed member's link up when the check finds nothing wrong", async () => {
    const h = harness({ mode: "relaxed", client: scripted({ triage: verdict({ question: "none" }) }) });
    await h.send(groupMessage(UNKNOWN_LINK));
    await settle();
    expect(h.removed()).toEqual([]);
    expect(h.alerts).toEqual([]);
  });

  it("tells the team about a case that needs a person, and the member what happens next", async () => {
    const h = harness({ client: scripted({ triage: verdict({ question: "none", needs_human: "lost_funds", reason: "Lost funds on a buy" }) }) });
    const m = groupMessage("I lost my money, my buy failed and the tokens never arrived");
    await h.send(m);
    await settle();
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ kind: "lost_funds", category: "lost_funds", member: { id: MEMBER.id }, aiGuess: "Lost funds on a buy", routine: false });
    expect(h.sends().map((s) => [s[1], s[2].replyTo])).toEqual([[testWords.answer.escalated, m.message_id]]);
    expect(h.records.counts(GROUP_ID, NOW).escalated).toBe(1);
  });

  it("only alerts in observe mode: no public reply to a case that needs a person, nor a DM warning", async () => {
    const h = harness({ mode: "observe", client: scripted({ triage: verdict({ question: "none", needs_human: "lost_funds", dm_scam_mention: true }) }) });
    await h.send(groupMessage("I lost my money after someone DMed me, my tokens never arrived"));
    await settle();
    expect(h.alerts.map((a) => a.kind)).toEqual(["lost_funds"]);
    expect(h.sends()).toEqual([]);
  });

  it("warns about DM scams at most once per 30 minutes in a group", async () => {
    const h = harness({ client: scripted({ triage: verdict({ question: "none", dm_scam_mention: true }) }) });
    await h.send(groupMessage("someone from support DMed me, should I answer?"));
    await h.send(groupMessage("an admin messaged me privately, is that normal?", { from: person(202) }));
    await settle();
    expect(h.sends().filter((s) => s[1] === testWords.safety.dmWarning)).toHaveLength(1);
  });

  it("deletes a stale burst's scams only, with no sanction or notice, and sends one summary", async () => {
    const h = harness({ client: null });
    const old = Math.floor(NOW / 1000) - 600;
    const scam = groupMessage("Claim your airdrop at tonkfun-airdrop.xyz", { date: old });
    const plain = groupMessage("what a day", { date: old, from: person(202) });
    const second = groupMessage("validate your wallet at tonkfun-sync.xyz", { date: old, from: person(203) });
    for (const m of [scam, plain, second]) expect(await h.send(m, true)).toBe("handled");
    await settle();
    expect(h.removed().sort()).toEqual([scam.message_id, second.message_id].sort());
    expect(h.out.log.filter((c) => ["restrict", "ban", "kick", "send"].includes(c.op))).toEqual([]);
    expect(h.alerts).toEqual([]);
    await h.tick(NOW + 20 * S);
    await h.tick(NOW + 60 * S);
    expect(h.alerts.map((a) => [a.kind, a.done])).toEqual([["action", testWords.mod.summary.replace("{count}", "2")]]);
  });
});
