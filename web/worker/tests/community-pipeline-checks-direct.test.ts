// @vitest-environment node
import { describe, expect, it } from "vitest";
import { failure, MEMBER } from "./community-fixtures";
import { answer, GROUP_ID, harness, mention, scripted, settle, testWords, verdict } from "./community-pipeline-fixtures";

/**
 * Fix round 2: what a question to the bot gets from its check. Without a
 * verdict it is answered only when it carries no link, handle or address,
 * else the busy note goes (answers#2); the case the check found reaches the
 * team when the answer path doesn't escalate it itself, once (answers#4);
 * and a DM scam Haiku read adds the fixed warning (answers#7).
 */

const LOST = "my wallet got drained right after I connected it on a site someone sent me, what now?";
const lost = () => verdict({ question: "tonkfun", needs_human: "lost_funds", reason: "Lost funds" });
const answered = (h: ReturnType<typeof harness>) => h.sends().filter((s) => s[1].startsWith(`<i>${testWords.answer.label}</i>`));

describe("a question to the bot with no verdict (answers#2)", () => {
  it("gets the busy note instead of an answer when it carries an address, a handle or an unknown link", async () => {
    for (const question of [
      "is 0x2222222222222222222222222222222222222222 the launchpad?",
      "what does @cryptojoe think about the fees?",
    ]) {
      const h = harness({ client: scripted({ triage: failure("timeout"), answer: answer() }) });
      await h.send(mention(question));
      await settle();
      expect(h.kinds()).toEqual(["triage"]);
      expect(answered(h)).toEqual([]);
      expect(h.sends().map((s) => s[1])).toEqual([testWords.answer.busy]);
    }
  });

  it("is still answered when it carries none, whether the check failed or couldn't run", async () => {
    const failed = harness({ client: scripted({ triage: failure("timeout"), answer: answer() }) });
    await failed.send(mention("how much is the protocol fee on a curve trade?"));
    await settle();
    expect(failed.kinds()).toEqual(["triage", "answer"]);
    const closed = harness({ client: scripted({ triage: verdict(), answer: answer() }) });
    if (closed.budget) closed.budget.available = (lane) => lane !== "triage";
    await closed.send(mention("how much is the protocol fee on a curve trade?"));
    await settle();
    expect(closed.kinds()).toEqual(["answer"]);
    expect(answered(closed)).toHaveLength(1);
  });

  it("never gets an answer posted under a link the check couldn't read (a trusted member's)", async () => {
    const h = harness({ client: scripted({ triage: verdict(), answer: answer() }) });
    h.records.trust(GROUP_ID, MEMBER.id, "0123456789abcdef", h.clock.now);
    if (h.budget) h.budget.available = (lane) => lane !== "triage";
    await h.send(mention("is coolcoin.xyz legit?"));
    await settle();
    expect(h.kinds()).toEqual([]);
    expect(h.sends().map((s) => s[1])).toEqual([testWords.answer.busy]);
  });
});

describe("the case a question's check found (answers#4)", () => {
  it("reaches the team when answers are paused, with the paused note to the member", async () => {
    const h = harness({ client: scripted({ triage: lost(), answer: answer() }), settings: { paused: true } });
    await h.send(mention(LOST));
    await settle();
    expect(h.kinds()).toEqual(["triage"]);
    expect(h.alerts.map((a) => [a.kind, a.aiGuess])).toEqual([["lost_funds", "Lost funds"]]);
    expect(h.sends().map((s) => s[1])).toEqual([testWords.answer.paused]);
  });

  it("reaches the team when the answer doesn't escalate it, and once when it does", async () => {
    const quiet = harness({ client: scripted({ triage: lost(), answer: answer() }) });
    await quiet.send(mention(LOST));
    await settle();
    expect(quiet.kinds()).toEqual(["triage", "answer"]);
    expect(quiet.alerts.map((a) => [a.kind, a.aiGuess])).toEqual([["lost_funds", "Lost funds"]]);
    const own = harness({ client: scripted({ triage: lost(), answer: answer({ escalate: "lost_funds", admin_note: "Drained after a link" }) }) });
    await own.send(mention(LOST));
    await settle();
    expect(own.alerts.map((a) => [a.kind, a.aiGuess])).toEqual([["lost_funds", "Drained after a link"]]);
  });

  it("reaches the team when the answer fails, and the member hears busy", async () => {
    // A timed-out answer: never retried, so it ends at once in the busy note.
    const h = harness({ client: scripted({ triage: lost(), answer: failure("timeout") }) });
    await h.send(mention(LOST));
    await settle();
    expect(h.kinds()).toEqual(["triage", "answer"]);
    expect(h.alerts.map((a) => a.kind)).toEqual(["lost_funds"]);
    expect(h.sends().map((s) => s[1])).toEqual([testWords.answer.busy]);
  });

  it("reaches the team once, as for any message, when its check removes the question", async () => {
    const h = harness({ client: scripted({ triage: verdict({ verdict: "spam", category: "link_spam", needs_human: "scam_report", reason: "Spam" }), answer: answer() }) });
    await h.send(mention(LOST));
    await settle();
    expect(h.kinds()).toEqual(["triage"]);
    expect(h.alerts.filter((a) => a.kind === "scam_report")).toHaveLength(1);
    expect(answered(h)).toEqual([]);
  });
});

describe("a DM scam Haiku read in a question to the bot (answers#7)", () => {
  const Q = "a team member called me and asked for my 12 words to fix my wallet, is that normal?";
  const dm = () => verdict({ question: "tonkfun", dm_scam_mention: true, reason: "DM scam" });

  it("puts the fixed DM warning in the answer, though the question's own words don't call for it", async () => {
    const h = harness({ client: scripted({ triage: dm(), answer: answer() }) });
    await h.send(mention(Q));
    await settle();
    expect(h.kinds()).toEqual(["triage", "answer"]);
    expect(answered(h)).toHaveLength(1);
    expect(answered(h)[0][1]).toContain(testWords.safety.dmWarning);
  });

  it("puts it in a stand-in too, such as the paused note", async () => {
    const h = harness({ client: scripted({ triage: dm(), answer: answer() }), settings: { paused: true } });
    await h.send(mention(Q));
    await settle();
    expect(h.sends().map((s) => s[1])).toEqual([`${testWords.answer.paused}\n\n${testWords.safety.dmWarning}`]);
  });
});
