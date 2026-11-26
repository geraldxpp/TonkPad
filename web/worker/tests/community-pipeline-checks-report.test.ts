// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TgMessage } from "../src/telegram/types";
import { groupMessage, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";
import { answer, DAY, FORUM, GROUP_ID, harness, mention, person, scripted, settle, testWords } from "./community-pipeline-fixtures";

/**
 * Fix round 2 (rules#1): a legitimacy question that carries the scam's link
 * is a scam report. The link is deleted so it doesn't spread (no offence),
 * the fixed warning goes out, and a question to the bot is still answered:
 * at once (a scam report never goes to Haiku's check), replying to nothing,
 * since its message is gone. The model reads the question masked, and the
 * output gate keeps the link out of the answer.
 */

const LINK = "tonkfun-airdrop.xyz";
/** The model's answer names the link: the gate takes it out. */
const reply = `No: ${LINK} is not a tonkfun.fun site, so please don't open it.`;
const answers = (h: ReturnType<typeof harness>) => h.sends().filter((s) => s[1].startsWith(`<i>${testWords.answer.label}</i>`));
const punished = (h: ReturnType<typeof harness>) => h.out.log.filter((c) => ["restrict", "ban", "kick"].includes(c.op));
const slashAsk = (text: string, extra: Partial<TgMessage> = {}) => groupMessage(`/ask ${text}`, { entities: [{ type: "bot_command", offset: 0, length: 4 }], ...extra });

describe("a question to the bot removed as a scam report (rules#1)", () => {
  it.each([
    ["a mention", () => mention(`is ${LINK} real?`)],
    ["/ask", () => slashAsk(`is ${LINK} real?`)],
  ])("%s gets the deletion, the fixed warning and an AI answer that replies to nothing", async (_, make) => {
    for (const standing of ["member", "new"] as const) {
      const h = harness({ client: scripted({ answer: answer({ reply, links: [] }) }) });
      if (standing === "new") h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
      const m = make();
      await h.send(m);
      await settle();
      expect(h.removed(), standing).toEqual([m.message_id]);
      expect(punished(h)).toEqual([]);
      expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
      expect(h.sends().filter((s) => s[1] === testWords.safety.scamReport)).toHaveLength(1);
      expect(h.alerts.map((a) => a.kind)).toEqual(["scam_report"]);
      // No check: the answer at once, from the question without the mention or /ask.
      expect(h.kinds()).toEqual(["answer"]);
      expect(JSON.stringify(h.calls[0].params)).toContain(`is ${LINK} real?`);
      const sent = answers(h);
      expect(sent).toHaveLength(1);
      expect(sent[0][2].replyTo).toBeUndefined();
      expect(sent[0][1]).toContain("is not a tonkfun.fun site");
      // The link never goes out again: not in the answer, nor in anything else the bot posted.
      for (const [, text] of h.sends()) expect(text).not.toContain(LINK);
    }
  });

  it("answers in the question's forum topic", async () => {
    const h = harness({ client: scripted({ answer: answer({ reply, links: [] }) }) });
    const m = mention(`is ${LINK} real?`, { chat: FORUM, is_topic_message: true, message_thread_id: 77 });
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    const sent = answers(h);
    expect(sent).toHaveLength(1);
    expect(sent[0][2]).toMatchObject({ kind: "answer", thread: 77 });
    expect(sent[0][2].replyTo).toBeUndefined();
  });

  it("sends a note in its place replying to nothing too, such as the paused note", async () => {
    const h = harness({ client: scripted({ answer: answer({ reply, links: [] }) }), settings: { paused: true } });
    const m = mention(`is ${LINK} real?`);
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(h.kinds()).toEqual([]);
    const paused = h.sends().filter((s) => s[1].includes(testWords.answer.paused));
    expect(paused).toHaveLength(1);
    expect(paused[0][2].replyTo).toBeUndefined();
  });

  it("still routes its command: a /report carrying the link reaches the team about the message it replies to", async () => {
    const h = harness({ client: null });
    const target = groupMessage("gm everyone", { from: person(555) });
    const m = groupMessage(`/report scam link ${LINK}`, { reply_to_message: target, entities: [{ type: "bot_command", offset: 0, length: 7 }] });
    await h.send(m);
    await settle();
    expect(h.removed()).toContain(m.message_id);
    expect(punished(h)).toEqual([]);
    // The rules' alert about the report itself, and the report's about the message it replies to, in either order.
    expect(h.alerts.map((a) => `${a.kind}:${a.messageId}`).sort()).toEqual([`report:${target.message_id}`, `scam_report:${m.message_id}`]);
  });

  it("never answers a question removed for anything else: a look-alike link offered, not asked about", async () => {
    const h = harness({ client: scripted({ answer: answer() }) });
    const m = mention(`claim your airdrop at ${LINK} now`);
    await h.send(m);
    await settle();
    expect(h.removed()).toContain(m.message_id);
    expect(h.kinds()).toEqual([]);
    expect(answers(h)).toEqual([]);
  });
});
