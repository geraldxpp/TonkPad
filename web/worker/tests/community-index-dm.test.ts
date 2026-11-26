// @vitest-environment node
import { describe, expect, it } from "vitest";
import { groupMessage } from "./community-fixtures";
import { answer, harness, mention, person, S, scripted, settle, testWords, verdict } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";

/**
 * One DM-safety warning pace per group, wired in index-build.ts: the rules'
 * warning on a help request that asks to be messaged (rules#2), an answer's
 * (answers#7) and Haiku's dm_scam_mention warning share it, so a group is
 * never warned twice within the pace, whichever posts first.
 */

const HELP = "my launch is stuck, can someone DM me";
const QUESTION = "a team member called me and asked for my 12 words to fix my wallet, is that normal?";
/** Every check reads a DM scam; every answer is the protocol fee. */
const dmScam = () => scripted({ triage: verdict({ question: "none", dm_scam_mention: true, reason: "DM scam" }), answer: answer() });
type Harness = ReturnType<typeof harness>;
/** What the group was sent that carries the warning: alone, or in an answer. */
const warned = (h: Harness) => h.sends().filter((s) => s[1].includes(testWords.safety.dmWarning));
const answered = (h: Harness) => h.sends().filter((s) => s[1].startsWith(`<i>${testWords.answer.label}</i>`));

describe("buildCommunity: the DM-safety warning's pace", () => {
  it("posts one warning for a help request and a DM-scam question to the bot within the pace: the rules' on the help request", async () => {
    const h = harness({ client: dmScam() });
    const help = groupMessage(HELP, { from: person(201) });
    await h.send(help);
    await settle();
    h.clock.now = NOW + 10 * S;
    await h.send(mention(QUESTION, { from: person(202) }));
    await settle();
    expect(warned(h)).toHaveLength(1);
    expect(warned(h)[0][1]).toBe(testWords.safety.dmWarning);
    expect(warned(h)[0][2]).toMatchObject({ kind: "notice", replyTo: help.message_id });
    // The question is still answered, without a second warning.
    expect(answered(h)).toHaveLength(1);
  });

  it("posts one when the question comes first: the answer carries it, and the help request gets none", async () => {
    const h = harness({ client: dmScam() });
    await h.send(mention(QUESTION, { from: person(202) }));
    await settle();
    h.clock.now = NOW + 10 * S;
    await h.send(groupMessage(HELP, { from: person(201) }));
    await settle();
    expect(warned(h)).toHaveLength(1);
    expect(answered(h)).toHaveLength(1);
    expect(answered(h)[0][1]).toContain(testWords.safety.dmWarning);
  });

  it("warns again once the pace has passed", async () => {
    const h = harness({ client: dmScam() });
    await h.send(groupMessage(HELP, { from: person(201) }));
    await settle();
    h.clock.now = NOW + 31 * 60 * S;
    await h.send(mention(QUESTION, { from: person(202) }));
    await settle();
    expect(warned(h)).toHaveLength(2);
  });
});
