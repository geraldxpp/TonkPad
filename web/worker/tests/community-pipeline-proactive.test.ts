// @vitest-environment node
import { describe, expect, it } from "vitest";
import { groupMessage } from "./community-fixtures";
import { NOW } from "./fixtures";
import { ADMIN, answer, GROUP_ID, harness, type HarnessOptions, person, S, scripted, settle, testWords, verdict } from "./community-pipeline-fixtures";

const QUESTION = "How long does the creator lock last on tonkfun?";
const ASKER = person(801);

/** A member's question nobody asked the bot, offered by Haiku's check and answered 90 seconds later. */
async function asked(options: HarnessOptions = {}) {
  const h = harness({ client: scripted({ triage: verdict(), answer: answer() }), ...options });
  const m = groupMessage(QUESTION, { from: ASKER });
  await h.send(m);
  await settle();
  return { h, m };
}

describe("the community pipeline: unprompted answers", () => {
  it("answer a question about tonkfun.fun after 90 seconds, replying to it", async () => {
    const { h, m } = await asked();
    await h.tick(NOW + 60 * S);
    await settle();
    expect(h.sends()).toEqual([]);
    await h.tick(NOW + 90 * S);
    await settle();
    expect(h.kinds()).toEqual(["triage", "answer"]);
    const [chat, text, options] = h.sends()[0];
    expect(chat).toBe(GROUP_ID);
    expect(text.split("\n")[0]).toBe(`<i>${testWords.answer.label}</i>`);
    expect(options).toMatchObject({ kind: "answer", replyTo: m.message_id });
    expect(h.records.counts(GROUP_ID, NOW).proactive).toBe(1);
  });

  it("are cancelled by a member's reply to the question", async () => {
    const { h, m } = await asked();
    h.clock.now = NOW + 30 * S;
    await h.send(groupMessage("about a month, see the Docs", { from: person(802), reply_to_message: m }));
    await h.tick(NOW + 90 * S);
    await settle();
    expect(h.sends()).toEqual([]);
    expect(h.kinds()).toEqual(["triage"]);
  });

  it("are cancelled by an admin's post in the chat", async () => {
    const { h } = await asked();
    h.clock.now = NOW + 30 * S;
    await h.send(groupMessage("I'll answer this one in a minute", { from: ADMIN }));
    await h.tick(NOW + 90 * S);
    await settle();
    expect(h.sends()).toEqual([]);
  });

  it("go to the admins as a preview in observe mode, never to the group", async () => {
    const { h, m } = await asked({ mode: "observe" });
    await h.tick(NOW + 90 * S);
    await settle();
    expect(h.sends()).toEqual([]);
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ kind: "preview", chat: GROUP_ID, messageId: m.message_id, routine: true, excerpt: null, member: null });
    // The model's words go in preview, under its own label; done carries only the bot's own words.
    expect(h.alerts[0].preview).toContain("1% protocol fee");
    expect(h.alerts[0].done).toBeNull();
  });

  it("stay silent when the facts don't answer it, or when unprompted answers are off", async () => {
    const silent = await asked({ client: scripted({ triage: verdict(), answer: answer({ answered: false, reply: "" }) }) });
    await silent.h.tick(NOW + 90 * S);
    await settle();
    expect(silent.h.sends()).toEqual([]);
    const off = await asked({ settings: { proactive: false } });
    await off.h.tick(NOW + 90 * S);
    await settle();
    expect(off.h.kinds()).toEqual(["triage"]);
    expect(off.h.sends()).toEqual([]);
  });

  it("stay silent when the gate blocks the answer", async () => {
    const { h } = await asked({ client: scripted({ triage: verdict(), answer: answer({ reply: "On tonkfun: it is guaranteed to 10x, risk-free." }) }) });
    await h.tick(NOW + 90 * S);
    await settle();
    expect(h.kinds()).toEqual(["triage", "answer"]);
    expect(h.sends()).toEqual([]);
  });

  it("aren't offered for a question Haiku's check finds isn't about tonkfun.fun", async () => {
    const { h } = await asked({ client: scripted({ triage: verdict({ question: "other" }), answer: answer() }) });
    await h.tick(NOW + 90 * S);
    await settle();
    expect(h.kinds()).toEqual(["triage"]);
  });
});
