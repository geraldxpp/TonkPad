// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MUTED } from "../src/telegram/community/permissions";
import { BOT, callsOf, groupMessage, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";
import { answer, DAY, GROUP_ID, harness, mention, person, scripted, settle, testWords, verdict } from "./community-pipeline-fixtures";

const SCAM = "Big promo from the team today: send 0.1 ETH to 0x2222222222222222222222222222222222222222 and you get 0.3 ETH back";
const scamCheck = () => scripted({ triage: verdict({ verdict: "scam", category: "phishing", question: "none", reason: "Doubling scam" }), answer: answer() });
const answered = (h: ReturnType<typeof harness>) => h.sends().filter((s) => s[1].startsWith(`<i>${testWords.answer.label}</i>`));

/** injection#1: a question to the bot is checked like any message first, and answered only if it still stands. */
describe("the community pipeline: questions to the bot", () => {
  it("checks a scam that mentions the bot, deletes it, mutes its author and alerts, and never answers it", async () => {
    const h = harness({ client: scamCheck() });
    const m = mention(SCAM);
    await h.send(m);
    await settle();
    expect(h.kinds()).toEqual(["triage"]);
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "restrict")).toEqual([[GROUP_ID, MEMBER.id, MUTED, Math.floor(NOW / 1000) + DAY / 1000]]);
    expect(h.alerts.map((a) => [a.kind, a.category])).toEqual([["action", "model_scam"]]);
    expect(answered(h)).toEqual([]);
  });

  it("does the same for /ask with a scam, and for a reply to one of the bot's answers", async () => {
    const h = harness({ client: scamCheck() });
    const ask = groupMessage(`/ask ${SCAM}`);
    const label = testWords.answer.label;
    const footer = testWords.answer.footer;
    const text = `${label}\nOn fees: every curve trade pays a fixed 1% protocol fee.\n\n${footer}`;
    const earlier = groupMessage(text, {
      message_id: 4_100, from: BOT,
      entities: [{ type: "italic", offset: 0, length: label.length }, { type: "italic", offset: text.length - footer.length, length: footer.length }],
    });
    const reply = groupMessage(SCAM, { from: person(202), reply_to_message: earlier });
    await h.send(ask);
    await h.send(reply);
    await settle();
    expect(h.kinds()).toEqual(["triage", "triage"]);
    expect(h.removed().sort()).toEqual([ask.message_id, reply.message_id].sort());
    expect(answered(h)).toEqual([]);
  });

  it("checks a question to the bot while answers are paused, and a new member's of 3 words or more", async () => {
    const paused = harness({ client: scamCheck(), settings: { paused: true } });
    const m = mention(SCAM);
    await paused.send(m);
    await settle();
    expect(paused.removed()).toEqual([m.message_id]);
    expect(answered(paused)).toEqual([]);
    const fresh = harness({ client: scripted({ triage: verdict({ question: "none" }), answer: answer() }) });
    fresh.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
    await fresh.send(mention("hello there friends"));
    await settle();
    expect(fresh.kinds()).toEqual(["triage", "answer"]);
  });

  it("answers a clean question once the check lets it stand, and when the check fails", async () => {
    const clean = harness({ client: scripted({ triage: verdict(), answer: answer() }) });
    await clean.send(mention("how much is the protocol fee on a curve trade?"));
    await settle();
    expect(clean.kinds()).toEqual(["triage", "answer"]);
    expect(answered(clean)).toHaveLength(1);
    // No verdict: the rules' decision stands, and the question is answered.
    const failed = harness({ client: scripted({ answer: answer() }) });
    await failed.send(mention("how much is the protocol fee on a curve trade?"));
    await settle();
    expect(failed.kinds()).toEqual(["triage", "answer"]);
    expect(answered(failed)).toHaveLength(1);
  });

  it("hands a channel identity's mention to the check, and bans that identity for a scam", async () => {
    const h = harness({ client: scamCheck() });
    const channel = { id: -1005555, type: "channel" as const, title: "Promo" };
    const m = mention(SCAM, { sender_chat: channel, from: { id: 136_817_688, is_bot: true, first_name: "Channel" } });
    await h.send(m);
    await settle();
    expect(h.kinds()).toEqual(["triage"]);
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "banSenderChat")).toEqual([[GROUP_ID, -1005555]]);
    expect(answered(h)).toEqual([]);
  });

  it("sends one alert for a question that needs a person: the answer's own, not a second one from the check", async () => {
    const h = harness({
      client: scripted({
        triage: verdict({ question: "tonkfun", needs_human: "lost_funds", reason: "Lost funds" }),
        answer: answer({ escalate: "lost_funds", admin_note: "Says a buy failed" }),
      }),
    });
    await h.send(mention("my buy failed and the money is gone, what happened?"));
    await settle();
    expect(h.kinds()).toEqual(["triage", "answer"]);
    expect(h.alerts.map((a) => [a.kind, a.aiGuess])).toEqual([["lost_funds", "Says a buy failed"]]);
    expect(answered(h)).toHaveLength(1);
    // The answer is the only reply: no second "I've let the team know" from the check.
    expect(h.sends()).toHaveLength(1);
  });

  it("never offers a question to the bot for an unprompted answer as well", async () => {
    const h = harness({ client: scripted({ triage: verdict(), answer: answer() }) });
    await h.send(mention("how long does the creator lock last on tonkfun?"));
    await settle();
    await h.tick(NOW + 120_000);
    await settle();
    expect(h.kinds()).toEqual(["triage", "answer"]);
    expect(h.records.counts(GROUP_ID, NOW).proactive).toBe(0);
  });
});
