import { describe, expect, it } from "vitest";
import { type Candidate, createProactive, MAX_AGE_MS, WAIT_MS } from "../src/telegram/agent/proactive";
import type { Standing } from "../src/telegram/community/types";
import type { TgChat, TgMessage, TgUser } from "../src/telegram/types";
import { GROUP, GROUP_ID, groupMessage, MEMBER } from "./community-fixtures";

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
const S = 1_000;
const M = 60 * S;
const OTHER: TgUser = { id: 202, is_bot: false, first_name: "Kai" };
const STAFF: TgUser = { id: 7_001, is_bot: false, first_name: "Alex" };
const OTHER_BOT: TgUser = { id: 777, is_bot: true, first_name: "Prices" };
const FORUM: TgChat = { ...GROUP, is_forum: true };
const SECOND_GROUP: TgChat = { id: -1002222222222, type: "supergroup", title: "Second" };
const yes = () => true;

/** A member's question, noted as the pipeline notes every message, and offered as Haiku's check would offer it. */
function ask(p: ReturnType<typeof createProactive>, text: string, extra: Partial<TgMessage> = {}, at = T0, standing: Standing = "member") {
  const m = groupMessage(text, extra);
  const c: Candidate = { chat: m.chat.id, messageId: m.message_id, user: m.from?.id ?? 0, text, lang: "en", thread: m.is_topic_message ? m.message_thread_id : undefined, at };
  p.noteMessage(m, standing, at);
  p.offer(c);
  return { m, c };
}

describe("unprompted candidates", () => {
  it("come due after 90 seconds, once", () => {
    const p = createProactive();
    const { c } = ask(p, "How does the creator lock work on tonkfun.fun?");
    expect(p.due(T0 + WAIT_MS - 1, yes)).toEqual([]);
    expect(p.due(T0 + WAIT_MS, yes)).toEqual([c]);
    expect(p.due(T0 + WAIT_MS + S, yes)).toEqual([]);
  });

  it("are cancelled by anyone's reply, even one that came in before the check finished", () => {
    const p = createProactive();
    const first = ask(p, "Is the Bridge open on Robinhood Chain?");
    p.noteMessage(groupMessage("yes, since last week", { from: OTHER, reply_to_message: first.m }), "member", T0 + 10 * S);
    const second = groupMessage("How long can a lock run?", { from: OTHER });
    p.noteMessage(second, "member", T0 + 20 * S);
    p.noteMessage(groupMessage("the Docs say it", { from: OTHER_BOT, reply_to_message: second }), "member", T0 + 25 * S);
    // Haiku's check took a while: the reply was already there when it offered the question.
    p.offer({ chat: GROUP_ID, messageId: second.message_id, user: OTHER.id, text: "How long can a lock run?", lang: "en", at: T0 + 20 * S });
    expect(p.due(T0 + 2 * M, yes)).toEqual([]);
  });

  it("are cancelled by an admin's or trusted member's post in their topic, and only there", () => {
    const outcome = (standing: Standing, post: Partial<TgMessage>) => {
      const p = createProactive();
      const { c } = ask(p, "How do I bridge to Robinhood Chain?", { chat: FORUM, message_thread_id: 7, is_topic_message: true });
      p.noteMessage(groupMessage("Welcome", { from: STAFF, ...post }), standing, T0 + 30 * S);
      return p.due(T0 + WAIT_MS, yes).includes(c);
    };
    for (const standing of ["admin", "trusted"] as const) {
      expect(outcome(standing, { chat: FORUM, message_thread_id: 7, is_topic_message: true }), standing).toBe(false);
      expect(outcome(standing, { chat: FORUM, message_thread_id: 8, is_topic_message: true }), standing).toBe(true);
      expect(outcome(standing, { chat: FORUM }), standing).toBe(true);
      expect(outcome(standing, { chat: SECOND_GROUP }), standing).toBe(true);
    }
    expect(outcome("member", { chat: FORUM, message_thread_id: 7, is_topic_message: true })).toBe(true);
    expect(outcome("new", { chat: FORUM, message_thread_id: 7, is_topic_message: true })).toBe(true);
  });

  it("in a group without topics, are cancelled by a staff post anywhere after them, but not before or by their own message", () => {
    const p = createProactive();
    p.noteMessage(groupMessage("Reminder: we never DM first", { from: STAFF }), "admin", T0 - M);
    const own = ask(p, "Can I edit my token's image after launch?", { from: STAFF }, T0, "trusted");
    expect(p.due(T0 + WAIT_MS, yes)).toEqual([own.c]);
    const q = ask(p, "Where do I see my Crew Rewards?", {}, T0 + M);
    const chain = groupMessage("first", { from: OTHER });
    p.noteMessage(groupMessage("Portfolio shows them", { from: STAFF, reply_to_message: chain, message_thread_id: chain.message_id }), "trusted", T0 + M + 5 * S);
    expect(p.due(T0 + M + WAIT_MS, yes)).not.toContain(q.c);
  });

  it("never come two in a row without a person writing in between", () => {
    const p = createProactive();
    const a = ask(p, "How do creator locks work?");
    const b = ask(p, "What does the Shield do?", { from: OTHER });
    const elsewhere = ask(p, "Where is the referral link?", { chat: SECOND_GROUP });
    expect(p.due(T0 + WAIT_MS, yes)).toEqual([a.c, elsewhere.c]);
    p.noteAnswered(GROUP_ID, MEMBER.id, T0 + WAIT_MS + 5 * S);
    expect(p.due(T0 + WAIT_MS + 6 * S, yes)).toEqual([]);
    // Another bot, an edit or a join isn't a person writing.
    p.noteMessage(groupMessage("BTC 98k", { from: OTHER_BOT }), "member", T0 + WAIT_MS + 7 * S);
    p.noteMessage({ ...a.m, edit_date: Math.floor(T0 / 1000) }, "member", T0 + WAIT_MS + 8 * S);
    p.noteMessage(groupMessage("", { text: undefined, new_chat_members: [OTHER] }), "member", T0 + WAIT_MS + 9 * S);
    expect(p.due(T0 + WAIT_MS + 10 * S, yes)).toEqual([]);
    p.noteMessage(groupMessage("thanks", { from: OTHER }), "member", T0 + WAIT_MS + 12 * S);
    expect(p.due(T0 + WAIT_MS + 15 * S, yes)).toEqual([b.c]);
  });

  it("never answer the same member twice in 10 minutes", () => {
    const p = createProactive();
    p.noteAnswered(GROUP_ID, MEMBER.id, T0);
    const again = ask(p, "And how long can a lock run?", {}, T0 + M);
    expect(p.due(T0 + M + WAIT_MS, yes)).toEqual([]);
    const other = ask(p, "Is there a fee to launch?", { from: OTHER }, T0 + 2 * M);
    expect(p.due(T0 + 2 * M + WAIT_MS, yes)).toEqual([other.c]);
    expect(p.due(T0 + 2 * M + WAIT_MS, yes)).not.toContain(again.c);
    const later = ask(p, "What is the Mission score?", {}, T0 + 10 * M - 100 * S);
    expect(p.due(T0 + 10 * M - S, yes)).toEqual([]);
    expect(p.due(T0 + 10 * M, yes)).toEqual([later.c]);
  });

  it("are kept for 2 minutes while the caller turns them down, then dropped and pruned", () => {
    const p = createProactive();
    const { c } = ask(p, "How is the launch fee set?");
    expect(p.due(T0 + WAIT_MS, () => false)).toEqual([]);
    expect(p.due(T0 + MAX_AGE_MS, yes)).toEqual([c]);
    const late = createProactive();
    ask(late, "How is the launch fee set?");
    expect(late.due(T0 + MAX_AGE_MS + 1, yes)).toEqual([]);
    const pruned = createProactive();
    ask(pruned, "How is the launch fee set?");
    pruned.prune(T0 + MAX_AGE_MS + 1);
    expect(pruned.due(T0 + WAIT_MS, yes)).toEqual([]);
  });

  it("ask the caller only once their own guards pass, and survive a caller that throws", () => {
    const p = createProactive();
    p.noteAnswered(GROUP_ID, OTHER.id, T0);
    ask(p, "Who pays the gas for a launch?", { from: OTHER }, T0 + S);
    const replied = ask(p, "Is there an app?", {}, T0 + 2 * S);
    p.noteMessage(groupMessage("no, just the site", { from: OTHER, reply_to_message: replied.m }), "member", T0 + 3 * S);
    const asked: number[] = [];
    const record = (c: Candidate) => {
      asked.push(c.messageId);
      return false;
    };
    expect(p.due(T0 + 2 * S + WAIT_MS, record)).toEqual([]);
    expect(asked).toEqual([]);
    const fresh = ask(p, "What are Crew Rewards?", {}, T0 + 2 * M);
    expect(p.due(T0 + 2 * M + WAIT_MS, () => { throw new Error("bug"); })).toEqual([]);
    expect(p.due(T0 + 2 * M + WAIT_MS, yes)).toEqual([fresh.c]);
  });

  it("drop a question once it is edited, and honour their own wait and age", () => {
    const p = createProactive({ waitMs: 3 * M, maxAgeMs: 5 * M });
    const edited = ask(p, "How do I claim my rewards?");
    p.noteMessage({ ...edited.m, edit_date: Math.floor(T0 / 1000) + 5 }, "member", T0 + 5 * S);
    const kept = ask(p, "What does graduation mean?", { from: OTHER }, T0 + S);
    expect(p.due(T0 + 3 * M, yes)).toEqual([]);
    expect(p.due(T0 + S + 3 * M, yes)).toEqual([kept.c]);
  });
});
