// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PAIR_MS } from "../src/telegram/inline-pending";
import type { TgMessage } from "../src/telegram/types";
import { callsOf, failure, GROUP, GROUP_ID, MEMBER, testWords } from "./community-fixtures";
import { ADMIN, answer, DAY, type HarnessOptions, person, scripted, settle, verdict } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { ASK_LINE, askPost, chosen, pairing } from "./telegram-inline-fixtures";

/**
 * Inline mode's Ask post, paired with its question, is /ask with that
 * question (community/qa-posted.ts): the post itself is moderated as any
 * message; Haiku's check, where the pipeline runs one for a question to the
 * bot, reads the question (never the posted line), by the question's own
 * markers, and its verdict acts on the post as it would on /ask; the
 * answer replies to the post. Nothing reaches the model without a question.
 */

const QUESTION = "how much is the protocol fee on a curve trade?";
/** A question with a link the rules don't know: Haiku's check reads it, as it would read /ask's. */
const LINKED = "what fees does https://coolcats.io charge?";
const SCAM = scripted({ triage: verdict({ verdict: "scam", category: "phishing", question: "none", reason: "Doubling scam" }), answer: answer() });

/** A bot (telegram-inline-fixtures pairing) that sends `asker`'s Ask post for `question`, the chosen result first, and lets it all finish. */
async function asked(question: string, options: HarnessOptions & { asker?: typeof MEMBER; newcomer?: boolean } = {}) {
  const b = pairing({ client: scripted({ triage: verdict(), answer: answer() }), ...options });
  const asker = options.asker ?? MEMBER;
  if (options.newcomer) b.h.records.markNewcomer(GROUP_ID, asker.id, NOW - 60_000, NOW + DAY);
  await b.send(chosen(question, asker));
  const post = askPost(GROUP, {}, asker);
  await b.send(post);
  await b.pass(PAIR_MS);
  await settle();
  const m = post.message as TgMessage;
  const triage = b.h.calls.filter((c) => c.kind === "triage").map((c) => JSON.stringify(c.params.messages));
  return { ...b, m, triage, model: JSON.stringify(b.h.calls.map((c) => c.params)) };
}

describe("Haiku's check of an Ask post's question", () => {
  it("reads the question and the question's own markers, never the posted line", async () => {
    const b = await asked(LINKED);
    expect(b.h.kinds()).toEqual(["triage", "answer"]);
    expect(b.triage[0]).toContain("coolcats.io");
    expect(b.triage[0]).toContain("what fees does");
    expect(b.model).not.toContain(ASK_LINE);
    expect(b.h.sends().filter((s) => s[2].replyTo === b.m.message_id && s[2].kind === "answer")).toHaveLength(1);
  });

  it("runs only where it would for /ask: a member's statement with no question, link or help words is answered at once, a new member's checked", async () => {
    const b = await asked("explain the creator lock tiers");
    expect(b.h.kinds()).toEqual(["answer"]);
    const fresh = await asked("explain the creator lock tiers", { newcomer: true });
    expect(fresh.h.kinds()).toEqual(["triage", "answer"]);
  });

  it("never runs for a question that reports a scam link, which is answered at once as /ask's scam report is; nothing is removed", async () => {
    const b = await asked("is https://tonkfun-claim.xyz the real claim site?", { client: SCAM });
    expect(b.h.kinds()).toEqual(["answer"]);
    expect(b.h.removed()).toEqual([]);
    expect(callsOf(b.h.out.log, "restrict")).toEqual([]);
  });

  it("lets a scam verdict act on the post as on /ask: removed, the member muted, never answered, and the alert quotes the question", async () => {
    const b = await asked(LINKED, { client: SCAM });
    expect(b.h.kinds()).toEqual(["triage"]);
    expect(b.h.removed()).toEqual([b.m.message_id]);
    expect(callsOf(b.h.out.log, "restrict").map((c) => c[1])).toEqual([MEMBER.id]);
    expect(b.h.alerts.map((a) => [a.category, a.excerpt])).toEqual([["model_scam", LINKED]]);
    expect(JSON.stringify(b.h.alerts)).not.toContain(ASK_LINE);
  });

  it("holds a new member's question with a link like their /ask when the check can't run, and gives a member the busy note", async () => {
    const client = scripted({ triage: failure("timeout"), answer: answer() });
    const held = await asked(LINKED, { client, newcomer: true });
    expect(held.h.removed()).toEqual([held.m.message_id]);
    expect(held.h.kinds()).toEqual(["triage"]);
    expect(held.h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
    const busy = await asked(LINKED, { client: scripted({ triage: failure("timeout"), answer: answer() }) });
    expect(busy.h.removed()).toEqual([]);
    expect(busy.h.sends().map((s) => [s[1], s[2].replyTo])).toEqual([[testWords.answer.busy, busy.m.message_id]]);
  });
});

describe("an Ask post's question, beyond the check", () => {
  it("gets the crisis reply for someone at risk, replying to the post: never answered, checked or punished", async () => {
    const b = await asked("i want to die lol");
    expect(b.h.calls).toEqual([]);
    expect(b.h.sends().map((s) => [s[1], s[2].replyTo])).toEqual([[expect.stringContaining(testWords.crisis.body), b.m.message_id]]);
    expect(b.h.alerts.map((a) => [a.kind, a.urgent])).toEqual([["crisis", true]]);
    expect(callsOf(b.h.out.log, "restrict")).toEqual([]);
  });

  it("is answered at once for an admin, never checked", async () => {
    const b = await asked(QUESTION, { asker: ADMIN });
    expect(b.h.kinds()).toEqual(["answer"]);
    expect(b.model).toContain(QUESTION);
  });

  it("is never asked when the post itself is removed, here for a name posing as the team", async () => {
    const b = await asked(QUESTION, { asker: person(303, { first_name: "TonkFun", last_name: "Support" }) });
    expect(b.h.removed()).toEqual([b.m.message_id]);
    expect(b.h.kinds()).not.toContain("answer");
    expect(b.model).not.toContain(QUESTION);
  });

  it("sends a new member's posted line to no check, though their 4 words of their own would go", async () => {
    const b = pairing({ client: scripted({ triage: verdict(), answer: answer() }) });
    b.h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
    await b.send(askPost());
    await b.pass(PAIR_MS);
    await settle();
    expect(b.h.calls).toEqual([]);
    expect(b.h.sends().map((s) => s[1])).toEqual([testWords.answer.askLost]);
  });
});
