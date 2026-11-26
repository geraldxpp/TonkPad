// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MUTED } from "../src/telegram/community/permissions";
import { BOT, callsOf, groupMessage, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";
import { answer, DAY, FORUM, GROUP_ID, harness, HOUR, mention, MINUTE, person, S, scripted, settle, testWords, verdict } from "./community-pipeline-fixtures";

const QUESTION = "how much is the protocol fee on a curve trade?";

/** Asked questions in the group: the answer's shape and place, its limits, and what an edit does. */
describe("the community pipeline: answers", () => {
  it("shows typing, then replies in the question's topic with the label first and no footer", async () => {
    const h = harness({ client: scripted({ answer: answer() }) });
    const m = mention(QUESTION, { chat: FORUM, is_topic_message: true, message_thread_id: 7 });
    expect(await h.send(m)).toBe("handled");
    await settle();
    const ops = h.out.log.filter((c) => c.op === "typing" || c.op === "send").map((c) => c.op);
    expect(ops).toEqual(["typing", "send"]);
    expect(callsOf(h.out.log, "typing")[0]).toEqual([GROUP_ID, 7]);
    const [chat, text, options] = h.sends()[0];
    expect(chat).toBe(GROUP_ID);
    expect(text.split("\n")[0]).toBe(`<i>${testWords.answer.label}</i>`);
    expect(text).not.toContain(testWords.answer.footer);
    expect(text).toContain("1% protocol fee");
    expect(options).toMatchObject({ kind: "answer", replyTo: m.message_id, thread: 7 });
    // A question to the bot is checked like any other first (injection#1); the answer waits for it.
    expect(h.kinds()).toEqual(["triage", "answer"]);
    expect(h.records.counts(GROUP_ID, NOW).answers).toBe(1);
  });

  it("takes an answer down when its question is edited", async () => {
    const h = harness({ client: scripted({ answer: answer() }) });
    const m = mention(QUESTION);
    await h.send(m);
    await settle();
    const answerId = 5_001;
    expect(callsOf(h.out.log, "send")).toHaveLength(1);
    await h.community.pipeline.onEdited({ ...m, text: "@TonkfunBot is the fee 0%?", edit_date: Math.floor(NOW / 1000) + 30 });
    await settle();
    expect(h.removed()).toEqual([answerId]);
  });

  it("mutes the author of a message over 47 hours old edited into a scam, without trying to delete it, and alerts", async () => {
    const h = harness({ client: null });
    const old = Math.floor((NOW - 48 * HOUR - MINUTE) / 1000);
    const m = groupMessage("Claim your airdrop at tonkfun-airdrop.xyz", { date: old, edit_date: Math.floor(NOW / 1000) });
    await h.community.pipeline.onEdited(m);
    await settle();
    expect(callsOf(h.out.log, "remove")).toEqual([]);
    expect(callsOf(h.out.log, "restrict")).toEqual([[GROUP_ID, MEMBER.id, MUTED, Math.floor(NOW / 1000) + DAY / 1000]]);
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0].done).toContain(testWords.admin.byHand);
  });

  it("asks for a shorter question past 600 characters, with no answer call", async () => {
    const h = harness({ client: scripted({ answer: answer() }) });
    const long = `${"how do the fees and the curve work together on tonkfun ".repeat(70)}?`;
    expect(long.length).toBeGreaterThan(3_800);
    await h.send(mention(long));
    await settle();
    expect(h.sends().map((s) => s[1])).toEqual([testWords.answer.tooLong]);
    expect(h.kinds()).toEqual(["triage"]);
  });

  it("keeps 30 accounts mentioning the bot in a minute within the group's limits", async () => {
    const h = harness({ client: scripted({ triage: verdict(), answer: answer() }) });
    // Each worded a little differently: the same 40 letters from 8 accounts would be a text raid (raid mode, a notice).
    for (let i = 0; i < 30; i += 1) {
      h.clock.now = NOW + i * S;
      await h.send(mention(`${QUESTION.slice(0, -1)}, asking for the ${i + 1}th time?`, { from: person(500 + i) }));
    }
    await settle();
    const answers = h.kinds().filter((kind) => kind === "answer");
    expect(answers.length).toBeGreaterThan(0);
    expect(answers.length).toBeLessThanOrEqual(4);
    expect(h.kinds().filter((kind) => kind === "triage")).toHaveLength(30);
    const texts = h.sends().map((s) => s[1]);
    expect(texts.filter((t) => t === testWords.answer.busy)).toHaveLength(1);
    expect(texts.length).toBeLessThanOrEqual(5);
  });

  it("says answers are paused once per group per 10 minutes when the budget is out, with no model call", async () => {
    const h = harness({ client: scripted({ answer: answer() }) });
    h.budget?.setOn(false, NOW);
    for (let i = 0; i < 3; i += 1) await h.send(mention(QUESTION, { from: person(600 + i) }));
    await settle();
    expect(h.sends().map((s) => s[1].split("\n")[0])).toEqual([testWords.answer.paused]);
    h.clock.now = NOW + 10 * MINUTE;
    await h.send(mention(QUESTION, { from: person(610) }));
    await settle();
    expect(h.sends()).toHaveLength(2);
    expect(h.calls).toHaveLength(0);
  });

  it("sends the earlier answer along when a member replies to one sent before 26 Nov 2026, without its footer", async () => {
    const h = harness({ client: scripted({ answer: answer() }) });
    const label = testWords.answer.label;
    const footer = testWords.answer.footer;
    const body = "On fees: every curve trade pays a fixed 1% protocol fee to tonkfun.fun.";
    const text = `${label}\n${body}\n\n${footer}`;
    const earlier = groupMessage(text, {
      message_id: 4_000, from: BOT,
      entities: [{ type: "italic", offset: 0, length: label.length }, { type: "italic", offset: text.length - footer.length, length: footer.length }],
    });
    const m = groupMessage("and is it the same on Solana?", { reply_to_message: earlier });
    await h.send(m);
    await settle();
    const messages = h.calls.find((c) => c.kind === "answer")?.params.messages ?? [];
    expect(messages).toContainEqual({ role: "assistant", content: body });
    expect(h.sends()[0][2].replyTo).toBe(m.message_id);
  });

  it("sends the earlier answer along when a member replies to one without a footer, its last line kept", async () => {
    const h = harness({ client: scripted({ answer: answer() }) });
    const label = testWords.answer.label;
    const body = "On fees: every curve trade pays a fixed 1% protocol fee to tonkfun.fun.\nThe Docs have the details.";
    const text = `${label}\n${body}`;
    const earlier = groupMessage(text, { message_id: 4_001, from: BOT, entities: [{ type: "italic", offset: 0, length: label.length }] });
    const m = groupMessage("and is it the same on Solana?", { reply_to_message: earlier });
    await h.send(m);
    await settle();
    const messages = h.calls.find((c) => c.kind === "answer")?.params.messages ?? [];
    expect(messages).toContainEqual({ role: "assistant", content: body });
  });

  it("answers /ask in reply to another member's question, but not to a remark", async () => {
    const h = harness({ client: scripted({ answer: answer() }) });
    const question = groupMessage("how long does the creator lock last?", { from: person(701) });
    const remark = groupMessage("great project", { from: person(702) });
    await h.send(question);
    await h.send(remark);
    await h.send(groupMessage("/ask", { from: person(703), reply_to_message: remark }));
    await settle();
    expect(h.sends()).toHaveLength(0);
    await h.send(groupMessage("/ask", { from: person(703), reply_to_message: question }));
    await settle();
    expect(h.sends().map((s) => s[2].replyTo)).toEqual([question.message_id]);
  });
});
