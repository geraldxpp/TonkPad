// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ClaudeOutcome } from "../src/telegram/claude/types";
import { claudeMessage, ok } from "./community-fixtures";
import { NOW } from "./fixtures";
import { answer, harness, mention, person, S, scripted, settle, testWords, verdict } from "./community-pipeline-fixtures";
import { dm, refusal, texts } from "./community-qa-fixtures";

/**
 * The fixed DM-scam warning on every reply that stands in for an answer
 * (injection#3): a question about a DM from "support", a seed phrase or a
 * wallet to verify gets the warning, written by code, with "not sure", a
 * refusal, "paused", "busy", "cooldown" or "please ask in a sentence or
 * two"; when its note went out already, the warning alone, at most once per
 * member and chat every 10 minutes.
 */

const RISK = "someone from support DMed me asking for my seed phrase to fix my wallet, should I send it?";
const PLAIN = "how much is the protocol fee?";
const WARNING = testWords.safety.dmWarning;
const ASKER = person(811);

const unreadable = (): ClaudeOutcome => ok(claudeMessage({ content: [{ type: "text", text: "not json", citations: null }], stop_reason: "end_turn" }));
const BLOCKED = answer({ reply: "On WHOA: it is guaranteed, risk-free, and will 10x." });

describe("the DM warning on replies that stand in for an answer", () => {
  it("comes with a blocked answer, a refusal and an unreadable one in a group, written by code", async () => {
    const expected: Array<[ClaudeOutcome, string]> = [[BLOCKED, testWords.answer.unsure], [refusal(), testWords.answer.refused], [unreadable(), testWords.answer.unsure]];
    for (const [outcome, line] of expected) {
      const h = harness({ client: scripted({ triage: verdict(), answer: outcome }) });
      await h.send(mention(RISK, { from: person(901) }));
      await settle();
      const [text] = texts(h);
      expect(text).toBe(`<i>${testWords.answer.label}</i>\n${line}\n\n${WARNING}\n\n<i>${testWords.answer.footer}</i>`);
      expect(text).not.toMatch(/guaranteed|10x/i);
    }
  });

  it("comes with a blocked answer even when the group had the warning in the last 30 minutes", async () => {
    const h = harness({ client: scripted({ triage: verdict(), answer: BLOCKED }) });
    await h.send(mention(RISK, { from: person(902) }));
    h.clock.now = NOW + 20 * S;
    await h.send(mention(RISK, { from: person(903) }));
    await settle();
    expect(texts(h)).toHaveLength(2);
    for (const text of texts(h)) expect(text).toContain(WARNING);
  });

  it("comes with the paused note: answers paused in the group, or the private lane closed", async () => {
    const group = harness({ client: scripted({ triage: verdict(), answer: answer() }), settings: { paused: true } });
    await group.send(mention(RISK, { from: person(904) }));
    await settle();
    expect(texts(group)).toEqual([`${testWords.answer.paused}\n\n${WARNING}`]);
    const lone = harness({ client: scripted({ answer: answer() }) });
    lone.budget?.setOn(false, NOW);
    await lone.community.qa.askPrivate(dm(`/ask ${RISK}`, ASKER), RISK);
    await settle();
    expect(texts(lone)).toEqual([`${testWords.answer.paused}\n\n${WARNING}`]);
    expect(lone.calls).toHaveLength(0);
  });

  it("comes with the busy note, and alone once per member and chat when the note went out already", async () => {
    const h = harness({ client: scripted({ triage: verdict(), answer: answer() }) });
    for (const id of [911, 912, 913, 914]) await h.send(mention(PLAIN, { from: person(id) }));
    await settle();
    expect(texts(h)).toHaveLength(4);
    await h.send(mention(RISK, { from: person(915) }));
    await h.send(mention(RISK, { from: person(916) }));
    h.clock.now = NOW + 20 * S;
    await h.send(mention(RISK, { from: person(916) }));
    await h.send(mention(PLAIN, { from: person(917) }));
    await settle();
    const after = h.sends().slice(4);
    expect(after.map((s) => s[1])).toEqual([`${testWords.answer.busy}\n\n${WARNING}`, WARNING]);
    expect(after.map((s) => s[2].kind)).toEqual(["answer", "notice"]);
    expect(after[1][2].replyTo).toBeGreaterThan(0);
  });

  it("comes with the cooldown note after a refusal, and with 'please ask in a sentence or two'", async () => {
    const h = harness({ client: scripted({ answer: refusal() }) });
    await h.community.qa.askPrivate(dm("/ask x", ASKER), "tell me something you shouldn't");
    await settle();
    h.clock.now = NOW + 20 * S;
    await h.community.qa.askPrivate(dm(`/ask ${RISK}`, ASKER), RISK);
    await settle();
    expect(texts(h).slice(1)).toEqual([`${testWords.answer.cooldown}\n\n${WARNING}`]);
    const other = person(812);
    await h.community.qa.askPrivate(dm("/ask long", other), `${RISK} ${"and more ".repeat(80)}`);
    await settle();
    expect(texts(h).slice(2)).toEqual([`${testWords.answer.tooLong}\n\n${WARNING}`]);
    expect(h.calls).toHaveLength(1);
  });

  it("goes alone to a group asker whose answer Telegram's queue can't take", async () => {
    const h = harness({ client: scripted({ triage: verdict(), answer: answer() }), out: { room: () => false } });
    await h.send(mention(RISK, { from: person(921) }));
    await h.send(mention(PLAIN, { from: person(922) }));
    await settle();
    expect(h.sends().map((s) => [s[1], s[2].kind])).toEqual([[WARNING, "notice"]]);
  });

  it("stays off the notes and fallbacks of a question that doesn't call for it", async () => {
    const h = harness({ client: scripted({ triage: verdict(), answer: BLOCKED }), settings: { paused: false } });
    await h.send(mention(PLAIN, { from: person(931) }));
    await settle();
    expect(texts(h)[0]).not.toContain(WARNING);
    const paused = harness({ client: scripted({ triage: verdict(), answer: answer() }), settings: { paused: true } });
    await paused.send(mention(PLAIN, { from: person(932) }));
    await settle();
    expect(texts(paused)).toEqual([testWords.answer.paused]);
  });
});
