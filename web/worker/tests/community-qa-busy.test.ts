// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NOW } from "./fixtures";
import { answer, harness, mention, MINUTE, person, S, scripted, settle, testWords, verdict } from "./community-pipeline-fixtures";
import { held, texts } from "./community-qa-fixtures";

/**
 * Fix round 2: an answer dropped from the answers' queue after waiting
 * past its model's answer deadline (60 seconds on Sonnet 5.5, the default;
 * 45 on Haiku 5.5) gets the busy note, with the DM warning when the
 * question calls for it (answers#8); and the warning sent on its own is
 * capped per group, at most once every 2 minutes, so a crowd of askers
 * can't fill the group's notices with copies of it (answers#12). The
 * review's model#4: a group runs 2 answers at once on Sonnet 5.5 and Opus
 * 5.5, and each asker whose answer is dropped gets the busy note, at most
 * once per 10 minutes each, not only the first in the chat.
 */

const RISK = "someone from support DMed me asking for my seed phrase to fix my wallet, should I send it?";
const PLAIN = "how much is the protocol fee?";
const WARNING = testWords.safety.dmWarning;

describe("an answer dropped from the queue after waiting (answers#8)", () => {
  it("gets the busy note with the DM warning past Sonnet 5.5's 60 seconds, and its answer is never started", async () => {
    const c = held();
    const h = harness({ client: c.client });
    await h.send(mention(PLAIN, { from: person(851) }));
    await h.send(mention("and how long does a creator lock last?", { from: person(855) }));
    await settle();
    // Sonnet 5.5 runs 2 answers at once in a group.
    expect(c.calls).toHaveLength(2);
    h.clock.now = NOW + 5 * S;
    const risk = mention(RISK, { from: person(852) });
    await h.send(risk);
    await settle();
    // The third waits behind them, still within its 60 seconds at 51...
    const toRisk = () => h.sends().filter((s) => s[2].replyTo === risk.message_id).map((s) => s[1]);
    h.clock.now = NOW + 51 * S;
    h.community.answers.prune();
    await settle();
    expect(toRisk()).toEqual([]);
    // ...and past them at 66.
    h.clock.now = NOW + 66 * S;
    h.community.answers.prune();
    await settle();
    expect(toRisk()).toEqual([`${testWords.answer.busy}\n\n${WARNING}`]);
    c.release(answer());
    c.release(answer());
    await settle();
    expect(c.calls).toHaveLength(2);
    expect(texts(h)).toHaveLength(3);
  });

  it("gives every asker whose answer was dropped the busy note, at most once per 10 minutes each (model#4)", async () => {
    const c = held();
    // Haiku 5.5 runs one answer at a time in a group: the others wait behind it, 45 seconds at most.
    const h = harness({ client: c.client, answerModel: "claude-haiku-5-5" });
    await h.send(mention(PLAIN, { from: person(871) }));
    const ask = async (id: number, at: number, question: string) => {
      h.clock.now = at;
      const m = mention(question, { from: person(id) });
      await h.send(m);
      await settle();
      return m;
    };
    const dropAt = async (at: number) => {
      h.clock.now = at;
      h.community.answers.prune();
      await settle();
    };
    const toAsker = (m: { message_id: number }) => h.sends().filter((s) => s[2].replyTo === m.message_id).map((s) => s[1]);
    const first = await ask(873, NOW + 5 * S, "and how long does a creator lock last?");
    const second = await ask(874, NOW + 6 * S, "and what does the Block-0 Shield do?");
    expect(c.calls).toHaveLength(1);
    // Both are dropped past their 45 seconds: each asker hears it, not only the first in the chat.
    await dropAt(NOW + 52 * S);
    expect([toAsker(first), toAsker(second)]).toEqual([[testWords.answer.busy], [testWords.answer.busy]]);
    // The same asker dropped again within 10 minutes hears nothing more...
    const again = await ask(873, NOW + 2 * MINUTE, "and when does a token graduate?");
    await dropAt(NOW + 2 * MINUTE + 46 * S);
    expect(toAsker(again)).toEqual([]);
    // ...and after 10 minutes, the note again.
    const anew = await ask(873, NOW + 11 * MINUTE, "and how is the Mission score worked out?");
    await dropAt(NOW + 11 * MINUTE + 46 * S);
    expect(toAsker(anew)).toEqual([testWords.answer.busy]);
    expect(c.calls).toHaveLength(1);
  });
});

describe("the DM warning on its own (answers#12)", () => {
  it("goes out at most once every 2 minutes per group, however many askers there are", async () => {
    const h = harness({ client: scripted({ triage: verdict(), answer: answer() }), settings: { paused: true } });
    // Each in their own words (the same text from 8 accounts would start raid mode).
    const asked = (i: number) => mention(`${RISK} (asking for the ${i}th time)`, { from: person(861 + i) });
    for (let i = 0; i < 10; i += 1) {
      h.clock.now = NOW + i * S;
      await h.send(asked(i));
    }
    await settle();
    // The paused note carries the warning; then the warning alone once; the other 8 askers get nothing new.
    expect(texts(h)).toEqual([`${testWords.answer.paused}\n\n${WARNING}`, WARNING]);
    h.clock.now = NOW + MINUTE + 30 * S;
    await h.send(asked(10));
    await settle();
    expect(texts(h)).toHaveLength(2);
    h.clock.now = NOW + 2 * MINUTE + 2 * S;
    await h.send(asked(11));
    await settle();
    expect(texts(h)).toEqual([`${testWords.answer.paused}\n\n${WARNING}`, WARNING, WARNING]);
  });
});
