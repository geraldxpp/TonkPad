// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CommunityHooks } from "../src/telegram/community/types";
import { type AskChat, askChatOf, askResultId, PAIR_MS, PENDING_MAX, PENDING_MS, type PendingAsk, PendingAsks } from "../src/telegram/inline-pending";
import { handleUpdate } from "../src/telegram/router";
import type { TgUser } from "../src/telegram/types";
import { MEMBER } from "./community-fixtures";
import { SEED } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { context, stubHooks, WHOA } from "./telegram-fixtures";
import { ASK_P, chosen, testClock } from "./telegram-inline-fixtures";

/**
 * Inline mode's Ask results someone chose (inline.ts onChosen) and the
 * questions they leave for their posts (inline-pending.ts PendingAsks): an
 * Ask result's only, from a person, while AI answers somewhere, kept for the
 * kind of chat its ID names; each person's newest of each kind, 60 seconds
 * and 1,000 questions at most, taken once, and only by a post in that kind
 * of chat.
 */

const ask = (question: string, at = NOW, chat: AskChat = "g"): PendingAsk => ({ question, chat, at });

describe("the questions waiting for their posts", () => {
  it("keeps each person's newest question until it is taken, once", () => {
    const store = new PendingAsks();
    store.put(1, ask("how do locks work?"));
    store.put(1, ask("what is the launch fee?", NOW + 1_000));
    store.put(2, ask("is the curve fair?"));
    expect(store.size).toBe(2);
    expect(store.take(1, "g", NOW + 2_000)?.question).toBe("what is the launch fee?");
    expect(store.take(1, "g", NOW + 2_000)).toBeNull();
    expect(store.take(3, "g", NOW)).toBeNull();
    expect(store.size).toBe(1);
  });

  it("keeps a question for its own kind of chat: a group post never takes one chosen in the bot's own chat, nor the reverse", () => {
    const store = new PendingAsks();
    store.put(1, ask("asked in a group?", NOW, "g"));
    store.put(1, ask("asked in private?", NOW + 1_000, "p"));
    expect(store.size).toBe(2);
    expect(store.take(1, "p", NOW + 2_000)?.question).toBe("asked in private?");
    expect(store.take(1, "p", NOW + 2_000)).toBeNull();
    expect(store.take(1, "g", NOW + 2_000)?.question).toBe("asked in a group?");
    expect(store.size).toBe(0);
  });

  it("gives none past its 60 seconds, nor one that came before `since`, and lets either go", () => {
    const store = new PendingAsks();
    store.put(1, ask("how do locks work?"));
    expect(store.take(1, "g", NOW + PENDING_MS + 1)).toBeNull();
    store.put(1, ask("how do locks work?"));
    expect(store.take(1, "g", NOW + 1_000, NOW + 1)).toBeNull();
    expect(store.size).toBe(0);
    store.put(2, ask("how do locks work?"));
    expect(store.take(2, "g", NOW + PENDING_MS, NOW)?.question).toBe("how do locks work?");
  });

  it("forgets what waited past a minute on prune, and holds 1,000 questions at most, dropping the oldest", () => {
    const store = new PendingAsks();
    store.put(1, ask("old one?"));
    store.put(2, ask("new one?", NOW + 30_000, "p"));
    store.prune(NOW + PENDING_MS + 1);
    expect([store.take(1, "g", NOW + 30_000), store.take(2, "p", NOW + 30_000)?.question]).toEqual([null, "new one?"]);
    for (let person = 1; person <= PENDING_MAX / 2 + 2; person += 1) for (const chat of ["g", "p"] as const) store.put(person, ask(`question ${person}${chat}?`, NOW, chat));
    expect(store.size).toBe(PENDING_MAX);
    expect([store.take(1, "g", NOW), store.take(2, "p", NOW)]).toEqual([null, null]);
    expect(store.take(3, "g", NOW)?.question).toBe("question 3g?");
  });

  it("lets a post wait up to 5 seconds for its question, then gives none; someone else's, or one of the other kind, never pairs", async () => {
    const time = testClock();
    const store = new PendingAsks(time.later);
    const first = store.wait(1, "g", NOW, NOW - 10_000);
    store.put(2, ask("someone else's?"));
    store.put(1, ask("chosen in private?", NOW, "p"));
    await time.pass(PAIR_MS - 1);
    store.put(1, ask("mine?", NOW + PAIR_MS - 1));
    expect(await first).toStrictEqual({ question: "mine?", chat: "g", at: NOW + PAIR_MS - 1 });
    expect(store.size).toBe(2);
    const second = store.wait(1, "g", time.now(), NOW);
    expect(store.waiters).toBe(1);
    await time.pass(PAIR_MS);
    expect(await second).toBeNull();
    expect(store.waiters).toBe(0);
    expect(store.take(1, "p", time.now())?.question).toBe("chosen in private?");
  });

  it("hands each waiting post of one person its own question, in order, of its own kind, and none once stopped", async () => {
    const time = testClock();
    const store = new PendingAsks(time.later);
    const posts = [store.wait(1, "g", NOW, NOW), store.wait(1, "p", NOW, NOW), store.wait(1, "g", NOW, NOW)];
    store.put(1, ask("private?", NOW, "p"));
    store.put(1, ask("first?"));
    store.put(1, ask("second?"));
    expect((await Promise.all(posts)).map((a) => a?.question)).toEqual(["first?", "private?", "second?"]);
    const waiting = store.wait(1, "g", NOW, NOW);
    store.put(3, ask("kept?"));
    store.stop();
    expect(await waiting).toBeNull();
    expect(store.size).toBe(0);
  });
});

describe("Ask's result IDs (inline-pending.ts askResultId)", () => {
  it("name the kind of chat Ask was offered in; no other ID is one", () => {
    expect([askResultId("g"), askResultId("p")]).toEqual(["ask:g", "ask:p"]);
    expect([askChatOf("ask:g"), askChatOf("ask:p")]).toEqual(["g", "p"]);
    for (const id of ["ask", "ask:", "ask:x", "ASK:G", " ask:g", "ask:g ", WHOA, "", null, undefined, 7]) expect(askChatOf(id), String(id)).toBeNull();
  });
});

describe("a chosen result (inline.ts onChosen)", () => {
  /** A bot with the store, whose community agent answers in its groups and/or private chats. */
  const bot = (on: { ai: boolean; groupAi: boolean } = { ai: true, groupAi: true }) => {
    const store = new PendingAsks();
    const community: CommunityHooks = { ...stubHooks({ ai: on.ai }), groupAi: () => on.groupAi };
    return { store, ctx: context({}, NOW, { community, pendingAsks: store }).ctx };
  };

  it("keeps an Ask result's question for a post in the kind of chat its ID names, cleaned, without a reply, and not the person's language", async () => {
    const { store, ctx } = bot();
    await handleUpdate(chosen("how\n\n do  locks‮ work?", { ...MEMBER, language_code: "de" }), ctx);
    await handleUpdate(chosen("what is the launch fee?", { ...MEMBER, language_code: "de" }, ASK_P), ctx);
    expect(store.take(MEMBER.id, "g", NOW)).toStrictEqual({ question: "how do locks work?", chat: "g", at: NOW });
    expect(store.take(MEMBER.id, "p", NOW)).toStrictEqual({ question: "what is the launch fee?", chat: "p", at: NOW });
  });

  it("ignores a card's result, any other ID (the old \"ask\" included), a bot's, one without a person, and any while AI answers nowhere", async () => {
    const { store, ctx } = bot();
    const ANON = { ...MEMBER, id: 0 };
    const updates = [
      chosen(WHOA, MEMBER, WHOA), chosen("how do locks work?", MEMBER, "ask"), chosen("how do locks work?", MEMBER, "ask:x"),
      chosen("how do locks work?", { ...MEMBER, is_bot: true }), chosen("how do locks work?", ANON),
    ];
    for (const update of updates) await handleUpdate(update, ctx);
    await handleUpdate({ update_id: 9, chosen_inline_result: { result_id: "ask:g", query: "how do locks work?" } as unknown as { result_id: string; from: TgUser; query: string } }, ctx);
    expect(store.size).toBe(0);
    for (const on of [{ ai: true, groupAi: false }, { ai: false, groupAi: true }]) {
      const one = bot(on);
      await handleUpdate(chosen("how do locks work?"), one.ctx);
      expect(one.store.size, JSON.stringify(on)).toBe(1);
    }
    const off = bot({ ai: false, groupAi: false });
    for (const id of ["ask:g", "ask:p"]) await handleUpdate(chosen("how do locks work?", MEMBER, id), off.ctx);
    expect(off.store.size).toBe(0);
  });

  it("keeps no question Ask wouldn't offer: a recovery phrase, a query Telegram cut, an address or chit-chat", async () => {
    const { store, ctx } = bot();
    for (const text of [`is this ok? ${SEED}`, `why ${"a".repeat(260)}?`, `what is ${WHOA}?`, "gm", "", "???"]) await handleUpdate(chosen(text), ctx);
    expect(store.size).toBe(0);
  });

  it("does nothing without the store, and never answers or logs", async () => {
    const logs: string[] = [];
    const { ctx, got } = context({}, NOW, { community: stubHooks(), log: (line) => void logs.push(line) });
    await handleUpdate(chosen("how do locks work?"), ctx);
    expect([got.sent, got.inline, got.answers, logs]).toEqual([[], [], [], []]);
  });
});
