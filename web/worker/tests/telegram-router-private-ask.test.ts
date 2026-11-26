// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CommunityHooks } from "../src/telegram/community/types";
import { en } from "../src/telegram/i18n/en";
import { de as communityDe } from "../src/telegram/i18n/community/de";
import { en as communityEn } from "../src/telegram/i18n/community/en";
import { PAIR_MS, PendingAsks } from "../src/telegram/inline-pending";
import { handleUpdate } from "../src/telegram/router";
import type { TgChat, TgMessage, TgMessageOrigin, TgUser } from "../src/telegram/types";
import { MEMBER } from "./community-fixtures";
import { ME } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { actingCalls, BOT_SELF, context, spyHooks, stubHooks, WALLET, WHOA } from "./telegram-fixtures";
import { liveCommunity, message, settle } from "./telegram-fixtures-community";
import { ASK_G, ASK_LINE, ASK_P, chosen, query, testClock } from "./telegram-inline-fixtures";

/**
 * A private chat with the bot (router-private.ts): inline mode's Ask post
 * there is /ask with the question chosen for it in the bot's own chat
 * (inline-pending.ts; never one chosen for a group), or the note that says
 * to use /ask; a forward of one gets nothing. And module 14
 * as it always was: forwarded commands run, but for the agent's /ask and
 * /report (someone else's words, read as text), and the bot's own card gets
 * a fresh card unless AI answers here.
 */

const PRIVATE: TgChat = { id: MEMBER.id, type: "private" };
/** The router tests' bot (telegram-fixtures BOT_SELF) as via_bot. */
const SELF: TgUser = { id: BOT_SELF.id, is_bot: true, first_name: "TonkFun", username: "tonkfun_bot" };
const OTHER: TgUser = { id: 202, is_bot: false, first_name: "Kai" };
const FORWARDS: TgMessageOrigin[] = [{ type: "user", date: 1, sender_user: OTHER }, { type: "user", date: 1, sender_user: MEMBER }];
const QUESTION = "how do creator locks work?";
const CARD_BUTTONS = { inline_keyboard: [[{ text: "Refresh", callback_data: `r:en:${WHOA}` }]] };

/** A router whose community agent (stubHooks, every call recorded; `hooks` overrides) answers with AI as `ai` says, with Ask's store on a test clock. */
function bot(o: { ai?: boolean; hooks?: Partial<CommunityHooks>; community?: boolean } = {}) {
  const time = testClock();
  const spy = spyHooks({ ...stubHooks({ ai: o.ai ?? true }), ...o.hooks });
  const store = new PendingAsks(time.later);
  const { ctx, got } = context({}, NOW, { ...(o.community === false ? {} : { community: spy.hooks }), pendingAsks: store, now: time.now });
  const send = async (update: Parameters<typeof handleUpdate>[0]) => {
    await handleUpdate(update, ctx);
    await time.pass(0);
  };
  return { ctx, got, spy, store, time, send };
}
const post = (extra: Partial<TgMessage> = {}, from: TgUser = MEMBER) => message(ASK_LINE, PRIVATE, { via_bot: SELF, from, ...extra });
/** The Ask result chosen in the bot's own chat, for `text`. */
const chosenHere = (text: string) => chosen(text, MEMBER, ASK_P);

describe("an Ask post in the bot's own chat", () => {
  it("asks the question chosen for it, whichever came first", async () => {
    const b = bot();
    await b.send(chosenHere(QUESTION));
    const first = post();
    await b.send(first);
    const second = post();
    await b.send(second);
    await b.time.pass(2_000);
    await b.send(chosenHere("what is the launch fee?"));
    expect(b.spy.of("askPrivate")).toEqual([[first.message, QUESTION], [second.message, "what is the launch fee?"]]);
    expect([b.spy.of("offerPrivate"), b.got.sent]).toEqual([[], []]);
  });

  it("says to use /ask, in the asker's language, when no question came within 5 seconds", async () => {
    const b = bot();
    await b.send(post({}, { ...MEMBER, language_code: "de" }));
    expect(b.got.sent).toEqual([]);
    await b.time.pass(PAIR_MS);
    expect(b.got.sent.map((s) => s.view.text)).toEqual([communityDe.answer.askLost]);
    expect(actingCalls(b.spy.calls)).toEqual([]);
  });

  it("never takes a question whose result was offered in a group, as Telegram's cache may serve it here, before it or while it waits: the note, and the question stays for a group post", async () => {
    const b = bot();
    await b.send(query(QUESTION, "supergroup"));
    const offered = b.got.inline[0]?.results[0]?.id ?? "";
    expect(offered).toBe(ASK_G);
    await b.send(chosen(QUESTION, MEMBER, offered));
    await b.send(post());
    await b.time.pass(1_000);
    await b.send(chosen("what is the launch fee?", MEMBER, offered));
    await b.time.pass(PAIR_MS);
    expect(b.spy.of("askPrivate")).toEqual([]);
    expect(b.got.sent.map((s) => s.view.text)).toEqual([communityEn.answer.askLost]);
    expect(b.store.size).toBe(1);
    expect(b.store.take(MEMBER.id, "g", b.time.now())?.question).toBe("what is the launch fee?");
  });

  it("ignores a forward of one, with AI answers on or off, and leaves the question waiting", async () => {
    for (const ai of [true, false]) {
      const b = bot({ ai });
      await b.send(chosenHere(QUESTION));
      for (const origin of FORWARDS) await b.send(post({ forward_origin: origin }));
      await b.time.pass(PAIR_MS);
      expect([actingCalls(b.spy.calls), b.got.sent], `${ai}`).toEqual([[], []]);
      expect(b.store.size, `${ai}`).toBe(ai ? 1 : 0);
    }
  });

  it("gets module 14's reply while private AI answers are off, or without the agent, and pairs with nothing", async () => {
    for (const o of [{ ai: false }, { community: false }]) {
      const b = bot(o);
      await b.send(chosenHere(QUESTION));
      await b.send(post());
      expect(b.got.sent.map((s) => s.view.text), JSON.stringify(o)).toEqual([expect.stringContaining(en.check.notAddress)]);
      expect(actingCalls(b.spy.calls)).toEqual([]);
    }
  });

  it("gets module 14's reply when private answers went off before its question came", async () => {
    const b = bot({ hooks: { askPrivate: async () => false } });
    await b.send(chosenHere(QUESTION));
    await b.send(post());
    expect(b.got.sent.map((s) => s.view.text)).toEqual([expect.stringContaining(en.check.notAddress)]);
  });

  it("sends the model the question, never the posted line (a whole community agent)", async () => {
    const live = liveCommunity();
    try {
      const time = testClock();
      const { ctx } = context({}, NOW, { community: live.hooks, me: () => ME, bot: () => "TonkfunBot", pendingAsks: new PendingAsks(time.later), now: time.now });
      await handleUpdate(chosenHere(QUESTION), ctx);
      await handleUpdate(message(ASK_LINE, PRIVATE, { via_bot: { id: ME.id, is_bot: true, first_name: "TonkFun" } }), ctx);
      await settle();
      expect(live.client.calls.map((c) => c.kind)).toEqual(["answer"]);
      expect(JSON.stringify(live.client.calls[0].params)).toContain(QUESTION);
      expect(JSON.stringify(live.client.calls[0].params)).not.toContain(ASK_LINE);
    } finally {
      live.hooks.stop();
    }
  });
});

describe("module 14 in a private chat, as before", () => {
  it("runs forwarded /start, /launches and /referral as ever, and reads a forwarded /ask or /report as text, offered Ask", async () => {
    for (const origin of FORWARDS) {
      const b = bot();
      for (const text of ["/start", "/launches", `/referral ${WALLET}`]) await b.send(message(text, PRIVATE, { forward_origin: origin }));
      const texts = b.got.sent.map((s) => s.view.text);
      expect(texts[0]).toContain(en.home.body);
      expect(texts[1]).toContain("<b>Latest on tonkfun.fun</b>");
      expect(texts[2]).toContain(`?ref=${WALLET}`);
      const agents = [`/ask ${QUESTION}`, `/ask@tonkfun_bot ${QUESTION}`, "/report someone DMed me"].map((text) => message(text, PRIVATE, { forward_origin: origin }));
      for (const update of agents) await b.send(update);
      expect(b.spy.of("offerPrivate")).toEqual(agents.map((update) => [update.message, update.message?.text]));
      expect([b.spy.of("askPrivate"), b.spy.of("reportPrivate")]).toEqual([[], []]);
    }
  });

  it("runs a forwarded /start appeal as ever, and ignores a forwarded command for another bot", async () => {
    const b = bot();
    const appeal = message("/start appeal", PRIVATE, { forward_origin: FORWARDS[0] });
    await b.send(appeal);
    await b.send(message("/start@other_bot", PRIVATE, { forward_origin: FORWARDS[0] }));
    expect(actingCalls(b.spy.calls)).toEqual(["startPrivate"]);
    expect(b.got.sent).toEqual([]);
  });

  it("gives the bot's own card, shared or forwarded, no reply while AI answers here, and a fresh card with AI off or without the agent", async () => {
    const card = (extra: Partial<TgMessage> = {}) => message(`Whoa the Tarsier · WHOA\n${WHOA}`, PRIVATE, { via_bot: SELF, reply_markup: CARD_BUTTONS, ...extra });
    const on = bot();
    for (const update of [card(), card({ forward_origin: FORWARDS[0] })]) await on.send(update);
    expect([actingCalls(on.spy.calls), on.got.sent]).toEqual([[], []]);
    for (const o of [{ ai: false }, { community: false }]) {
      const off = bot(o);
      for (const update of [card(), card({ forward_origin: FORWARDS[0] })]) await off.send(update);
      expect(off.got.sent.map((s) => s.view.text), JSON.stringify(o)).toEqual([expect.stringContaining("<b>Whoa the Tarsier</b>"), expect.stringContaining("<b>Whoa the Tarsier</b>")]);
    }
  });

  it("knows the bot's card by its ID alone: one through an account holding its username is read as text, offered Ask", async () => {
    const b = bot();
    const other = message(`Whoa the Tarsier · WHOA\nIs it locked?\n${WHOA}`, PRIVATE, { via_bot: { ...SELF, id: 4_242 }, reply_markup: CARD_BUTTONS });
    await b.send(other);
    expect(b.spy.of("offerPrivate")).toEqual([[other.message, other.message?.text]]);
  });
});
