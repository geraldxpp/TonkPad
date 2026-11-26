// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PAIR_MS, PENDING_MS } from "../src/telegram/inline-pending";
import type { TgChat, TgMessage } from "../src/telegram/types";
import { callsOf, GROUP, MEMBER, testWords } from "./community-fixtures";
import { answer, person, scripted, settle, verdict } from "./community-pipeline-fixtures";
import { DATE } from "./telegram-fixtures-community";
import { WHOA } from "./telegram-fixtures";
import { ASK_LINE, askPost, chosen, pairing } from "./telegram-inline-fixtures";

/**
 * Inline mode's Ask post in a community group, through the router: the
 * fixed line the Ask result posts, moderated as any message, paired with
 * the question Telegram's chosen result brought (inline-pending.ts), the
 * same person's within seconds, whichever comes first. It is /ask with that
 * question, its answer replying to the post; the posted line itself never
 * goes to Anthropic. A post whose question never comes gets the note that
 * says to use /ask, once per 10 minutes; another group's post gets nothing.
 * What Haiku's check reads, and what its verdict does, is in
 * community-pipeline-inline-check.test.ts.
 */

const QUESTION = "how much is the protocol fee on a curve trade?";
const OTHER_GROUP: TgChat = { id: -1_005_555_555_555, type: "supergroup", title: "Someone else's group" };
const KAI = person(202, { first_name: "Kai" });

const ok = () => pairing({ client: scripted({ triage: verdict(), answer: answer() }) });
type Bot = ReturnType<typeof ok>;
const answers = (b: Bot) => b.h.sends().filter((s) => s[1].startsWith(`<i>${testWords.answer.label}</i>`));
const notes = (b: Bot) => b.h.sends().filter((s) => s[1] === testWords.answer.askLost);
const sentToModel = (b: Bot) => JSON.stringify(b.h.calls.map((c) => c.params));
const message = (u: ReturnType<typeof askPost>): TgMessage => u.message as TgMessage;

describe("an Ask post in a community group", () => {
  it("asks the question chosen for it, when the chosen result came first; the answer replies to the post", async () => {
    const b = ok();
    await b.send(chosen(QUESTION));
    const post = askPost();
    await b.send(post);
    await settle();
    expect(b.h.kinds()).toEqual(["triage", "answer"]);
    expect(answers(b).map((s) => s[2].replyTo)).toEqual([message(post).message_id]);
    expect(sentToModel(b)).toContain(QUESTION);
    expect(sentToModel(b)).not.toContain(ASK_LINE);
    expect(b.store?.size).toBe(0);
  });

  it("waits for a question that comes up to 5 seconds after the post", async () => {
    const b = ok();
    const post = askPost();
    await b.send(post);
    await b.pass(PAIR_MS - 1_000);
    expect(b.h.calls).toEqual([]);
    await b.send(chosen(QUESTION));
    await settle();
    expect(b.h.kinds()).toEqual(["triage", "answer"]);
    expect(answers(b).map((s) => s[2].replyTo)).toEqual([message(post).message_id]);
    await b.pass(PAIR_MS);
    expect(notes(b)).toEqual([]);
  });

  it("says to use /ask when no question came within 5 seconds, replying to the post, once per 10 minutes, and sends nothing to the model", async () => {
    const b = ok();
    const post = askPost();
    await b.send(post);
    await b.pass(PAIR_MS);
    await settle();
    expect(notes(b).map((s) => [s[0], s[2].kind, s[2].replyTo])).toEqual([[GROUP.id, "answer", message(post).message_id]]);
    await b.send(askPost());
    await b.pass(PAIR_MS);
    await settle();
    expect(notes(b)).toHaveLength(1);
    expect(b.h.calls).toEqual([]);
    // A question that comes too late is kept for no post: it pairs with nothing, and goes in its minute.
    await b.send(chosen(QUESTION));
    expect(b.store?.size).toBe(1);
    b.store?.prune(b.time.now() + PENDING_MS + 1);
    expect(b.store?.size).toBe(0);
  });

  it("never pairs a question past its 60 seconds, as when the post waited while the agent started", async () => {
    const b = ok();
    await b.send(chosen(QUESTION));
    await b.pass(PENDING_MS + 1_000);
    // Sent when the question came, handed over a minute later.
    await b.send(askPost(GROUP, { date: DATE }));
    await b.pass(PAIR_MS);
    await settle();
    expect(b.h.calls).toEqual([]);
    expect(notes(b)).toHaveLength(1);
  });

  it("never pairs a question chosen over 10 seconds before the post, say in another chat", async () => {
    const b = ok();
    await b.send(chosen("is this other group's token safe?"));
    await b.pass(15_000);
    await b.send(askPost(GROUP, { date: Math.floor(b.time.now() / 1000) }));
    await b.pass(1_000);
    await b.send(chosen(QUESTION));
    await settle();
    expect(sentToModel(b)).toContain(QUESTION);
    expect(sentToModel(b)).not.toContain("other group's token");
  });

  it("never takes another person's question, nor a card's chosen result", async () => {
    const b = ok();
    await b.send(chosen(QUESTION, KAI));
    await b.send(chosen(WHOA, MEMBER, WHOA));
    await b.send(askPost());
    await b.pass(PAIR_MS);
    await settle();
    expect(b.h.calls).toEqual([]);
    expect(notes(b)).toHaveLength(1);
    expect(b.store?.take(KAI.id, "g", b.time.now())?.question).toBe(QUESTION);
  });

  it("pairs nothing with a forward of a post, sends it to no check and asks nothing, though Telegram keeps via_bot on it", async () => {
    const b = ok();
    await b.send(chosen(QUESTION));
    for (const origin of [{ type: "user" as const, date: 1, sender_user: KAI }, { type: "user" as const, date: 1, sender_user: MEMBER }]) {
      await b.send(askPost(GROUP, { forward_origin: origin }));
    }
    await b.pass(PAIR_MS);
    await settle();
    expect(b.h.calls).toEqual([]);
    expect(b.h.sends()).toEqual([]);
    expect(b.store?.size).toBe(1);
  });

  it("is a question only as the fixed line: a plain message via the bot with any other text never asks", async () => {
    const b = ok();
    await b.send(chosen(QUESTION));
    await b.send(askPost(GROUP, { text: QUESTION }));
    await b.pass(PAIR_MS);
    await settle();
    expect(b.h.kinds()).not.toContain("answer");
    expect(answers(b)).toEqual([]);
    expect(b.store?.size).toBe(1);
  });

  it("gets nothing in another group, and its question goes unused", async () => {
    const b = ok();
    await b.send(chosen(QUESTION));
    await b.send(askPost(OTHER_GROUP));
    await b.pass(PAIR_MS);
    await settle();
    expect([b.h.calls, b.h.sends(), b.got.sent]).toEqual([[], [], []]);
    expect(b.store?.size).toBe(1);
  });

  it("says to use /ask when the bot keeps no questions at all", async () => {
    const b = pairing({ client: scripted({ triage: verdict(), answer: answer() }), store: false });
    await b.send(chosen(QUESTION));
    await b.send(askPost());
    await settle();
    expect(notes(b)).toHaveLength(1);
    expect(b.h.calls).toEqual([]);
    expect(callsOf(b.h.out.log, "remove")).toEqual([]);
  });

  it("answers the newest of two questions chosen before one post, and the note for a second post", async () => {
    const b = ok();
    await b.send(chosen("how do creator locks work?"));
    await b.send(chosen(QUESTION));
    await b.send(askPost());
    await b.send(askPost());
    await b.pass(PAIR_MS);
    await settle();
    expect(sentToModel(b)).toContain(QUESTION);
    expect(sentToModel(b)).not.toContain("creator locks");
    expect(answers(b)).toHaveLength(1);
    expect(notes(b)).toHaveLength(1);
  });
});
