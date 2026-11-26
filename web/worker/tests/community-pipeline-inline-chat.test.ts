// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PAIR_MS } from "../src/telegram/inline-pending";
import type { TgMessage } from "../src/telegram/types";
import { GROUP, MEMBER, testWords } from "./community-fixtures";
import { answer, scripted, settle, verdict } from "./community-pipeline-fixtures";
import { ASK_P, askPost, chosen, pairing, PRIVATE, query } from "./telegram-inline-fixtures";

/**
 * Which question an Ask post pairs with, by where its result was chosen
 * (inline-pending.ts): Telegram's chosen result names no chat, so the Ask
 * result's ID says whether it was offered in a supergroup ("ask:g") or in
 * the bot's own chat ("ask:p"), and a community group's post pairs only
 * with the first, a private post only with the second. A question chosen
 * for the other kind of chat, even from a result Telegram's cache served
 * where it wasn't offered, is no pair: the post gets the note that says to
 * use /ask, and the question waits for its own kind of post.
 */

const QUESTION = "how much is the protocol fee on a curve trade?";
const PRIVATE_Q = "is my private launch draft saved anywhere?";

const ok = () => pairing({ client: scripted({ triage: verdict(), answer: answer() }) });
type Bot = ReturnType<typeof ok>;
const answers = (b: Bot) => b.h.sends().filter((s) => s[1].startsWith(`<i>${testWords.answer.label}</i>`));
const notes = (b: Bot) => b.h.sends().filter((s) => s[1] === testWords.answer.askLost);
const requests = (b: Bot, kind: string) => b.h.calls.filter((c) => c.kind === kind).map((c) => JSON.stringify(c.params));
const message = (u: ReturnType<typeof askPost>): TgMessage => u.message as TgMessage;

describe("an Ask post pairs only with a question chosen for its kind of chat", () => {
  it("never takes, in a community group, a question whose result was offered in the bot's own chat (as Telegram's cache may serve it there), before it or while it waits: the note, and the question stays for a private post", async () => {
    const b = ok();
    await b.send(query(QUESTION, "sender"));
    const offered = b.got.inline[0]?.results[0]?.id ?? "";
    expect(offered).toBe(ASK_P);
    await b.send(chosen(QUESTION, MEMBER, offered));
    const post = askPost();
    await b.send(post);
    await b.pass(1_000);
    await b.send(chosen(PRIVATE_Q, MEMBER, offered));
    await b.pass(PAIR_MS);
    await settle();
    expect(b.h.calls).toEqual([]);
    expect(notes(b).map((s) => [s[0], s[2].replyTo])).toEqual([[GROUP.id, message(post).message_id]]);
    expect(b.store?.size).toBe(1);
    expect(b.store?.take(MEMBER.id, "p", b.time.now())?.question).toBe(PRIVATE_Q);
  });

  it("answers a group post with the question chosen for a group, never a newer one chosen in the bot's own chat", async () => {
    const b = ok();
    await b.send(chosen(QUESTION));
    await b.send(chosen(PRIVATE_Q, MEMBER, ASK_P));
    const post = askPost();
    await b.send(post);
    await settle();
    expect(requests(b, "triage").join()).toContain(QUESTION);
    expect(b.h.calls.map((c) => JSON.stringify(c.params)).join()).not.toContain(PRIVATE_Q);
    expect(answers(b).map((s) => [s[0], s[2].replyTo])).toEqual([[GROUP.id, message(post).message_id]]);
    expect(b.store?.take(MEMBER.id, "p", b.time.now())?.question).toBe(PRIVATE_Q);
  });

  it("gives a group post that waits for its late question, and an Ask in the bot's own chat meanwhile, each its own question", async () => {
    const b = ok();
    const group = askPost();
    await b.send(group);
    await b.pass(1_000);
    await b.send(chosen(PRIVATE_Q, MEMBER, ASK_P));
    const mine = askPost(PRIVATE);
    await b.send(mine);
    // The private answer first; an asker's next answer may come 15 seconds later, by the agent's own clock (claude/limits.ts).
    await settle();
    b.h.clock.now += 16_000;
    await b.pass(1_000);
    await b.send(chosen(QUESTION));
    await settle();
    // The group's question alone goes to Haiku's check; each answer asks its own question, in its own chat.
    expect(requests(b, "triage")).toHaveLength(1);
    expect(requests(b, "triage")[0]).toContain(QUESTION);
    expect(requests(b, "triage")[0]).not.toContain(PRIVATE_Q);
    const asked = requests(b, "answer");
    expect([asked.filter((r) => r.includes(QUESTION)).length, asked.filter((r) => r.includes(PRIVATE_Q)).length]).toEqual([1, 1]);
    expect(answers(b).map((s) => [s[0], s[2].replyTo ?? null]).sort()).toEqual([[GROUP.id, message(group).message_id], [PRIVATE.id, expect.anything()]].sort());
    expect([notes(b), b.store?.size]).toEqual([[], 0]);
  });
});
