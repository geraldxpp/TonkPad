import { describe, expect, it } from "vitest";
import { LOCALES } from "@/shared/i18n/config";
import { askLine, askPost, askTrigger, detectTrigger, forwarded, forwardedFromMe, isAskLine, isMe, type Me, viaMe } from "../src/telegram/agent/triggers";
import { BOT_DICTIONARIES } from "../src/telegram/i18n";
import type { TgChat, TgMessage, TgMessageEntity, TgMessageOrigin, TgUser } from "../src/telegram/types";
import { BOT, BOT_ID, GROUP, groupMessage, MEMBER, testWords } from "./community-fixtures";

/**
 * What the bot's own inline mode posts (agent/triggers-via.ts): a token's
 * card, with buttons, or Ask's fixed line ("Asked TonkFun a question." in
 * any of the 12 languages), never anything a member typed. Neither is a
 * question by itself; a person's own Ask post asks once the router pairs it
 * with its question (askTrigger). A forward keeps via_bot, but pairs with
 * nothing. The bot is via_bot by its ID alone, never by a username another
 * account may hold.
 */

const ME: Me = { id: BOT_ID, usernames: ["TonkfunBot", "TonkFunAI_bot"] };
const LABELS: ReadonlySet<string> = new Set([testWords.answer.label]);
const OTHER: TgUser = { id: 202, is_bot: false, first_name: "Kai" };
const PROMO: TgUser = { id: 5, is_bot: true, first_name: "Promo", username: "promo_bot" };
const ANONYMOUS: TgUser = { id: 1087968824, is_bot: true, first_name: "Group", username: "GroupAnonymousBot" };
/** Another account holding one of the bot's usernames (say, one the bot dropped): not the bot. */
const lookalike = (username: string): TgUser => ({ id: 1, is_bot: true, first_name: "TonkFun", username });
const CHANNEL: TgChat = { id: -100555, type: "channel", title: "tonkfun.fun news" };
/** Where a forward came from: someone else, the member themselves, or a hidden account. */
const ORIGINS: TgMessageOrigin[] = [
  { type: "user", date: 0, sender_user: OTHER },
  { type: "user", date: 0, sender_user: MEMBER },
  { type: "hidden_user", date: 0, sender_user_name: "Kai" },
];
const EVM = "0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95";
const CARD_BUTTONS = { inline_keyboard: [[{ text: "Open", url: `https://www.tonkfun.fun/token/${EVM}` }], [{ text: "Refresh", callback_data: `r:en:${EVM}` }]] };
const LINES = LOCALES.map((l) => BOT_DICTIONARIES[l.code].inline.askPosted);

/** A plain message via the bot: Ask's line in English unless given. */
const via = (text = LINES[0], extra: Partial<TgMessage> = {}) => groupMessage(text, { via_bot: BOT, ...extra });
/** The bot's token card, shared through inline mode: via the bot, with its buttons. */
const card = (text = `Whoa the Tarsier · WHOA\nMission score 78 · Safe\n${EVM}`, extra: Partial<TgMessage> = {}) => via(text, { reply_markup: CARD_BUTTONS, ...extra });

/** One of the bot's answers: its label in italics. */
function answer(): TgMessage {
  const { label } = testWords.answer;
  const text = `${label}\nOn fees: every curve trade pays a fixed 1% protocol fee.`;
  const entities: TgMessageEntity[] = [{ type: "italic", offset: 0, length: label.length }];
  return groupMessage(text, { from: BOT, entities });
}

describe("Ask's fixed line", () => {
  it("is known whole in each of the 12 languages, each its own", () => {
    expect(new Set(LINES).size).toBe(LOCALES.length);
    for (const line of LINES) {
      expect(isAskLine(line), line).toBe(true);
      expect(askLine(via(line), ME), line).toBe(true);
      expect(askPost(via(line), ME), line).toBe(true);
    }
  });

  it("is nothing else: any other text, the line within more, or changed, or as a caption", () => {
    for (const text of ["what is the launch fee?", `${LINES[0]} what is the fee?`, ` ${LINES[0]}`, LINES[0].toLowerCase(), LINES[0].slice(0, -1), ""]) {
      expect(isAskLine(text), text).toBe(false);
      expect(askLine(via(text), ME), text).toBe(false);
    }
    expect(askLine(groupMessage("", { via_bot: BOT, text: undefined, caption: LINES[0] }), ME)).toBe(false);
    expect(isAskLine(undefined)).toBe(false);
  });

  it("is the bot's only by its ID, and never a card, a message the member typed, or one through another bot", () => {
    expect(askLine(via(LINES[0], { via_bot: lookalike("TonkfunBot") }), ME)).toBe(false);
    expect(askLine(card(LINES[0]), ME)).toBe(false);
    expect(askLine(groupMessage(LINES[0]), ME)).toBe(false);
    expect(askLine(via(LINES[0], { via_bot: PROMO }), ME)).toBe(false);
    expect(askLine(via(), null)).toBe(false);
  });

  it("is a person's own post only unforwarded, from a person, not as a chat nor from a bot", () => {
    for (const origin of ORIGINS) {
      expect(askLine(via(LINES[0], { forward_origin: origin }), ME)).toBe(true);
      expect(askPost(via(LINES[0], { forward_origin: origin }), ME)).toBe(false);
    }
    expect(askPost(via(LINES[0], { is_automatic_forward: true }), ME)).toBe(false);
    expect(askPost(via(LINES[0], { from: ANONYMOUS, sender_chat: GROUP }), ME)).toBe(false);
    expect(askPost(via(LINES[0], { from: PROMO }), ME)).toBe(false);
    expect(askPost(via(LINES[0], { from: undefined }), ME)).toBe(false);
    expect(askPost(via(LINES[0], { is_automatic_forward: false, forward_origin: undefined }), ME)).toBe(true);
  });
});

describe("what the bot's inline mode posted, as a question", () => {
  const detect = (m: TgMessage) => detectTrigger(m, ME, LABELS);

  it("is never one by itself: Ask's line, any other plain message via the bot, or a card, whatever it says", () => {
    expect(detect(via())).toBeNull();
    expect(detect(via("what is the launch fee?"))).toBeNull();
    expect(detect(via("/ask what is the launch fee?"))).toBeNull();
    expect(detect(via("@TonkfunBot is it safe?", { entities: [{ type: "mention", offset: 0, length: 11 }] }))).toBeNull();
    expect(detect(via("what is the launch fee?", { reply_to_message: answer() }))).toBeNull();
    expect(detect(card())).toBeNull();
    // Through another bot, or an account holding the bot's username, a mention still asks.
    const mention = { entities: [{ type: "mention", offset: 0, length: 11 }] };
    expect(detect(via("@TonkfunBot is it safe?", { via_bot: PROMO, ...mention }))?.kind).toBe("mention");
    expect(detect(via("@TonkfunBot is it safe?", { via_bot: lookalike("TonkfunBot"), ...mention }))?.kind).toBe("mention");
  });

  it("asks once paired: /ask with that question, with the bot's answer it replies to", () => {
    expect(askTrigger(via(), ME, LABELS, "  how\n do  locks‮ work? ")).toEqual({
      kind: "ask", question: "how do locks work?", earlierAnswer: null, cardAddress: null, target: "own", targetMessageId: null,
    });
    expect(askTrigger(via(LINES[7], { reply_to_message: answer() }), ME, LABELS, "and on Solana?")).toMatchObject({
      kind: "ask", question: "and on Solana?", earlierAnswer: "On fees: every curve trade pays a fixed 1% protocol fee.", target: "own",
    });
  });

  it("never asks for a forward, another text via the bot, a card, someone posting as a chat, or an empty question", () => {
    expect(askTrigger(via(LINES[0], { forward_origin: ORIGINS[1] }), ME, LABELS, "how do locks work?")).toBeNull();
    expect(askTrigger(via("how do locks work?"), ME, LABELS, "how do locks work?")).toBeNull();
    expect(askTrigger(card(LINES[0]), ME, LABELS, "how do locks work?")).toBeNull();
    expect(askTrigger(via(LINES[0], { from: ANONYMOUS, sender_chat: GROUP }), ME, LABELS, "how do locks work?")).toBeNull();
    expect(askTrigger(via(), ME, LABELS, " ​ ")).toBeNull();
  });
});

describe("via the bot, and forwards (viaMe, isMe, forwarded, forwardedFromMe)", () => {
  it("tells the bot's card from its plain message, forwarded or not, by the bot's ID alone", () => {
    expect(viaMe(card(), ME)).toBe("card");
    expect(viaMe(via(), ME)).toBe("plain");
    for (const origin of ORIGINS) expect([viaMe(card(undefined, { forward_origin: origin }), ME), viaMe(via(LINES[0], { forward_origin: origin }), ME)]).toEqual(["card", "plain"]);
    expect(viaMe(via(LINES[0], { via_bot: lookalike("@tonkfunbot") }), ME)).toBeNull();
    expect(viaMe(via(LINES[0], { via_bot: PROMO }), ME)).toBeNull();
    expect(viaMe(groupMessage("hi"), ME)).toBeNull();
    expect(viaMe(via(LINES[0], { via_bot: "TonkfunBot" } as unknown as Partial<TgMessage>), ME)).toBeNull();
    expect(viaMe(via(), null)).toBeNull();
    expect(isMe({ id: BOT_ID, is_bot: true, first_name: "TonkFun" }, ME)).toBe(true);
    for (const user of [lookalike("TonkfunBot"), { id: String(BOT_ID), username: "TonkfunBot" }, "TonkfunBot", null, undefined]) expect(isMe(user, ME)).toBe(false);
  });

  it("tells a forward or a channel's automatic copy from the sender's own message, and a forward of the bot's own by its ID", () => {
    const of = (origin: TgMessageOrigin) => groupMessage("/ask how do creator locks work?", { forward_origin: origin });
    for (const origin of ORIGINS) expect(forwarded(of(origin))).toBe(true);
    expect(forwarded(groupMessage("gm", { is_automatic_forward: true, sender_chat: CHANNEL }))).toBe(true);
    expect(forwarded(groupMessage("gm", { is_automatic_forward: false, forward_origin: undefined }))).toBe(false);
    expect(forwardedFromMe(of({ type: "user", date: 0, sender_user: BOT }), ME)).toBe(true);
    for (const username of ["TonkfunBot", "TonkFunAI_bot"]) expect(forwardedFromMe(of({ type: "user", date: 0, sender_user: lookalike(username) }), ME)).toBe(false);
    for (const origin of ORIGINS) expect(forwardedFromMe(of(origin), ME)).toBe(false);
    expect(forwardedFromMe(of({ type: "chat", date: 0, sender_chat: GROUP, sender_user: BOT }), ME)).toBe(false);
    expect(forwardedFromMe(of({ type: "user", date: 0, sender_user: BOT }), null)).toBe(false);
    expect(forwardedFromMe(groupMessage("gm", { forward_origin: "TonkfunBot" } as unknown as Partial<TgMessage>), ME)).toBe(false);
  });
});
