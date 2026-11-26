// @vitest-environment node
import { describe, expect, it } from "vitest";
import { callsOf, groupMessage, MEMBER } from "./community-fixtures";
import { byText, SCAM, scamHandled } from "./community-pipeline-checks-fixtures";
import { NOW } from "./fixtures";
import { DAY, GROUP_ID, harness, mention, MINUTE, person, S, settle } from "./community-pipeline-fixtures";

/**
 * Fix round 2 (answers#2): a message past its member's 3 checks a minute is
 * checked once one comes back, within its 60 seconds, instead of falling
 * back at once; a question to the bot is answered only after that verdict.
 * When no turn comes in time, the rules' decision stands and a new member's
 * link, handle or address is held, with no offence.
 */

describe("a member past 3 checks a minute (answers#2)", () => {
  const threeQuestions = async (h: ReturnType<typeof harness>) => {
    for (let i = 0; i < 3; i += 1) {
      h.clock.now = NOW + i * 2 * S;
      await h.send(groupMessage(`question ${i + 1}: how do the fees work here?`));
    }
    await settle();
  };

  it("has their next message checked when a check comes back, within its minute", async () => {
    const h = harness({ client: byText().client });
    await threeQuestions(h);
    h.clock.now = NOW + 8 * S;
    const m = groupMessage(SCAM);
    await h.send(m);
    await settle();
    expect(h.kinds()).toEqual(["triage", "triage", "triage"]);
    await h.tick(NOW + 60 * S);
    await settle();
    expect(h.kinds()).toEqual(["triage", "triage", "triage", "triage"]);
    scamHandled(h, m);
  });

  it("never answers a question to the bot before its check, nor one its check removed", async () => {
    const h = harness({ client: byText().client });
    await threeQuestions(h);
    h.clock.now = NOW + 8 * S;
    const m = mention(SCAM);
    await h.send(m);
    await settle();
    expect(h.sends().filter((s) => s[2].replyTo === m.message_id)).toEqual([]);
    await h.tick(NOW + 61 * S);
    await settle();
    expect(h.kinds()).not.toContain("answer");
    expect(h.sends().filter((s) => s[2].replyTo === m.message_id && s[2].kind === "answer")).toEqual([]);
    scamHandled(h, m);
  });

  it("answers a clean question once its turn's check lets it stand", async () => {
    const h = harness({ client: byText().client });
    await threeQuestions(h);
    h.clock.now = NOW + 8 * S;
    await h.send(mention("how much is the protocol fee on a curve trade?"));
    await settle();
    expect(h.kinds()).toEqual(["triage", "triage", "triage"]);
    await h.tick(NOW + 60 * S);
    await settle();
    expect(h.kinds()).toEqual(["triage", "triage", "triage", "triage", "answer"]);
  });

  it("checks a new member's scam after three greetings", async () => {
    const h = harness({ client: byText().client });
    h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - MINUTE, NOW + DAY);
    for (const [i, line] of ["hello everyone here", "nice project you have", "glad to be here"].entries()) {
      h.clock.now = NOW + i * 3 * S;
      await h.send(groupMessage(line));
    }
    await settle();
    h.clock.now = NOW + 12 * S;
    const m = groupMessage(SCAM);
    await h.send(m);
    await settle();
    await h.tick(NOW + 60 * S);
    await settle();
    expect(h.removed()).toContain(m.message_id);
    expect(h.alerts.map((a) => a.category)).toContain("model_scam");
  });

  it("falls back when no turn comes in time: a new member's address is held, with no offence, and a member's message stays", async () => {
    for (const standing of ["new", "member"] as const) {
      const h = harness({ client: byText().client });
      if (standing === "new") h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - MINUTE, NOW + DAY);
      await threeQuestions(h);
      h.clock.now = NOW + 8 * S;
      const m = groupMessage(SCAM);
      await h.send(m);
      await settle();
      // The checks' budget runs out before the turn comes: the rules' decision stands.
      if (h.budget) h.budget.available = (lane) => lane !== "triage";
      await h.tick(NOW + 60 * S);
      await settle();
      expect(h.kinds()).toHaveLength(3);
      expect(h.removed()).toEqual(standing === "new" ? [m.message_id] : []);
      expect(h.records.offences(GROUP_ID, MEMBER.id, NOW + MINUTE).n).toBe(0);
      expect(callsOf(h.out.log, "restrict")).toEqual([]);
      if (standing === "new") {
        expect(h.records.counts(GROUP_ID, NOW).held).toBe(1);
        expect(h.alerts.map((a) => [a.kind, a.category])).toEqual([["action", "newcomer_link"]]);
      }
    }
  });

  it("leaves other members' checks alone while one member waits", async () => {
    const h = harness({ client: byText().client });
    await threeQuestions(h);
    h.clock.now = NOW + 8 * S;
    await h.send(groupMessage("question 4: and the locks?"));
    await h.send(groupMessage("how do locks work here?", { from: person(202) }));
    await settle();
    expect(h.kinds()).toEqual(["triage", "triage", "triage", "triage"]);
    const fourth = JSON.stringify(h.calls[3].params);
    expect(fourth).toContain("how do locks work here?");
  });
});
