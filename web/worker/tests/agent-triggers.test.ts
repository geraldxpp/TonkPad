import { describe, expect, it } from "vitest";
import { detectTrigger, isTopicRootReply, type Me, topicOf } from "../src/telegram/agent/triggers";
import type { TgChat, TgMessage, TgMessageEntity, TgUser } from "../src/telegram/types";
import { BOT, BOT_ID, GROUP, groupMessage, MEMBER, testWords } from "./community-fixtures";

const ME: Me = { id: BOT_ID, usernames: ["TonkfunBot", "TonkFunAI_bot"] };
const OTHER: TgUser = { id: 202, is_bot: false, first_name: "Kai" };
const OTHER_BOT: TgUser = { id: 777, is_bot: true, first_name: "Prices", username: "price_bot" };
const ANONYMOUS: TgUser = { id: 1087968824, is_bot: true, first_name: "Group", username: "GroupAnonymousBot" };
const FORUM: TgChat = { ...GROUP, is_forum: true };
const EVM = "0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95";
const MINT = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";

/** An answer's frame in three languages: the tests' own words, not the real dictionaries. */
const FRAMES = {
  en: { label: testWords.answer.label, footer: testWords.answer.footer },
  es: { label: "Respuesta de IA", footer: "IA · puede equivocarse · no es asesoramiento financiero" },
  ru: { label: "Ответ ИИ", footer: "ИИ · может ошибаться · не финансовый совет" },
};
const LABELS: ReadonlySet<string> = new Set(Object.values(FRAMES).map((f) => f.label));
const BODY = ["On fees: tonkfun.fun takes 1% of each swap.", "The Docs have the details."];

/** A mention entity over `word` in `text`. */
const mention = (text: string, word: string): TgMessageEntity => ({ type: "mention", offset: text.indexOf(word), length: word.length });
/** A member's message mentioning `word`. */
const mentioning = (text: string, word: string, extra: Partial<TgMessage> = {}) => groupMessage(text, { entities: [mention(text, word)], ...extra });
const detect = (m: TgMessage) => detectTrigger(m, ME, LABELS);

/** One of the bot's messages as Telegram hands it back: plain text, an italic entity over each line listed. */
function botMessage(lines: string[], italicLines: number[] = [], extra: Partial<TgMessage> = {}): TgMessage {
  const entities: TgMessageEntity[] = [];
  let at = 0;
  lines.forEach((line, i) => {
    if (italicLines.includes(i)) entities.push({ type: "italic", offset: at, length: line.length });
    at += line.length + 1;
  });
  return groupMessage(lines.join("\n"), { from: BOT, entities, ...extra });
}

const answer = (frame: { label: string; footer: string }, body = BODY) => botMessage([frame.label, ...body, frame.footer], [0, body.length + 1]);

/** A module-14 card: its plain text and its Open, Refresh and Share buttons. */
const card = (address: string, refresh = `r:en:${address}`, name = "Whoa the Tarsier") =>
  botMessage([`${name} · WHOA`, "tonkfun.fun · Robinhood Chain", "", "Mission score 78 · Safe", "", address], [], {
    reply_markup: { inline_keyboard: [[{ text: "Open", url: "https://www.tonkfun.fun/token/x" }], [{ text: "Refresh", callback_data: refresh }, { text: "Share", url: "https://t.me/share/url" }]] },
  });

const reply = (to: TgMessage, text: string, extra: Partial<TgMessage> = {}) => groupMessage(text, { reply_to_message: to, ...extra });

describe("mentions", () => {
  it("answer a mention of any of the bot's usernames, in any case, without the mention", () => {
    expect(detect(mentioning("@tonkfunbot how do creator locks work?", "@tonkfunbot"))).toEqual({
      kind: "mention", question: "how do creator locks work?", earlierAnswer: null, cardAddress: null, target: "own", targetMessageId: null,
    });
    expect(detect(mentioning("What does the Shield do, @TONKFUNAI_BOT?", "@TONKFUNAI_BOT"))?.question).toBe("What does the Shield do?");
    expect(detect(mentioning("@TonkfunBot, is Bridge open?", "@TonkfunBot"))?.question).toBe("is Bridge open?");
    expect(detectTrigger(mentioning("@TonkfunBot hi", "@TonkfunBot"), { id: BOT_ID, usernames: ["@TonkfunBot"] }, LABELS)?.kind).toBe("mention");
  });

  it("ignore other handles, and text that only looks like a mention", () => {
    expect(detect(mentioning("@TonkfunBotFan is cool", "@TonkfunBotFan"))).toBeNull();
    expect(detect(mentioning("@alice how do locks work?", "@alice"))).toBeNull();
    expect(detect(groupMessage("@TonkfunBot how do locks work?"))).toBeNull();
    expect(detect(groupMessage("`@TonkfunBot`", { entities: [{ type: "code", offset: 0, length: 13 }] }))).toBeNull();
    const malformed = [null, 5, { type: "mention" }, { type: "mention", offset: -1, length: 11 }, { type: "mention", offset: 0, length: 99 }];
    expect(detect(groupMessage("@TonkfunBot hello", { entities: malformed as unknown as TgMessageEntity[] }))).toBeNull();
  });

  it("read a caption, and clean the question through visibleText", () => {
    const caption = "@TonkfunBot what is this screen?";
    expect(detect(groupMessage("", { text: undefined, photo: [{}], caption, caption_entities: [mention(caption, "@TonkfunBot")] }))?.question).toBe("what is this screen?");
    const text = "@TonkfunBot​ how\n\n do  locks‮ work?";
    expect(detect(mentioning(text, "@TonkfunBot"))?.question).toBe("how do locks work?");
  });

  it("never fire for a bot, the bot itself, a forward or a channel's automatic copy", () => {
    const text = "@TonkfunBot what is the fee?";
    expect(detect(mentioning(text, "@TonkfunBot", { from: OTHER_BOT }))).toBeNull();
    expect(detect(mentioning(text, "@TonkfunBot", { from: BOT }))).toBeNull();
    expect(detect(mentioning(text, "@TonkfunBot", { forward_origin: { type: "user", date: 0, sender_user: OTHER } }))).toBeNull();
    expect(detect(mentioning(text, "@TonkfunBot", { is_automatic_forward: true, sender_chat: { id: -100555, type: "channel" } }))).toBeNull();
    // An anonymous admin writes as the group, with a placeholder bot as the author.
    expect(detect(mentioning(text, "@TonkfunBot", { from: ANONYMOUS, sender_chat: GROUP }))?.kind).toBe("mention");
  });
});

describe("/ask", () => {
  it("takes its argument as the question, addressed to the bot or to none", () => {
    expect(detect(groupMessage("/ask how much is the launch fee?"))).toEqual({
      kind: "ask", question: "how much is the launch fee?", earlierAnswer: null, cardAddress: null, target: "own", targetMessageId: null,
    });
    expect(detect(groupMessage("/ask@TonkfunBot what is the Shield"))?.question).toBe("what is the Shield");
    expect(detect(groupMessage("/ASK@tonkfunai_bot  what   is a lock"))?.question).toBe("what is a lock");
  });

  it("leaves an empty question to the caller when there is neither an argument nor a reply", () => {
    expect(detect(groupMessage("/ask"))).toMatchObject({ kind: "ask", question: "", target: "own", targetMessageId: null });
  });

  it("ignores /ask for another bot, and every other command", () => {
    expect(detect(groupMessage("/ask@other_bot what is this?"))).toBeNull();
    expect(detect(groupMessage("/help"))).toBeNull();
    expect(detect(reply(card(EVM), `/check ${EVM}`))).toBeNull();
    expect(detect(reply(answer(FRAMES.en), "/report"))).toBeNull();
  });

  it("alone, in reply to another member's message, asks that message", () => {
    const question = groupMessage("Does the creator get the launch fee?", { from: OTHER });
    expect(detect(reply(question, "/ask"))).toEqual({
      kind: "ask", question: "Does the creator get the launch fee?", earlierAnswer: null, cardAddress: null, target: "other", targetMessageId: question.message_id,
    });
    const mine = groupMessage("How long can a lock run?");
    expect(detect(reply(mine, "/ask@TonkfunBot"))).toMatchObject({ question: "How long can a lock run?", target: "own", targetMessageId: mine.message_id });
    const anonymous = groupMessage("Is the Bridge open today?", { from: ANONYMOUS, sender_chat: GROUP });
    expect(detect(reply(anonymous, "/ask"))).toMatchObject({ target: "other", targetMessageId: anonymous.message_id });
  });

  it("with an argument asks the argument, and a reply to the bot keeps its context", () => {
    const other = groupMessage("Whatever, this is fine", { from: OTHER });
    expect(detect(reply(other, "/ask is the curve the same on Solana?"))).toMatchObject({ question: "is the curve the same on Solana?", target: "own", targetMessageId: null });
    expect(detect(reply(answer(FRAMES.en), "/ask and on Solana?"))).toMatchObject({ kind: "ask", question: "and on Solana?", earlierAnswer: BODY.join("\n") });
    expect(detect(reply(answer(FRAMES.en), "/ask"))).toMatchObject({ kind: "ask", question: "", earlierAnswer: BODY.join("\n"), targetMessageId: null });
    expect(detect(reply(groupMessage("Buy now?", { from: OTHER_BOT }), "/ask"))).toMatchObject({ question: "", target: "own", targetMessageId: null });
    const post = groupMessage("Is your wallet ready for launch day?", { from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: -100555, type: "channel" }, is_automatic_forward: true });
    expect(detect(reply(post, "/ask"))).toMatchObject({ question: "", target: "own", targetMessageId: null });
  });
});

describe("replies to the bot", () => {
  it("to an answer, in three languages, carry it without its label and footer", () => {
    for (const frame of Object.values(FRAMES)) {
      const t = detect(reply(answer(frame), "and on Solana?"));
      expect(t).toEqual({ kind: "reply", question: "and on Solana?", earlierAnswer: BODY.join("\n"), cardAddress: null, target: "own", targetMessageId: null });
      expect(t?.earlierAnswer).not.toContain(frame.label);
      expect(t?.earlierAnswer).not.toContain(frame.footer);
    }
  });

  it("keep the code-built lines, drop blank ones, and keep a last line that isn't the italic footer", () => {
    const { label, footer } = FRAMES.en;
    const scored = botMessage([label, "On WHOA: its creator locked 20%.", "", "Mission score 78 · Safe: a rating of chain facts, not a promise", "", footer, ""], [0, 5]);
    expect(detect(reply(scored, "why?"))?.earlierAnswer).toBe("On WHOA: its creator locked 20%.\nMission score 78 · Safe: a rating of chain facts, not a promise");
    expect(detect(reply(botMessage([label, testWords.answer.unsure], [0]), "why not?"))?.earlierAnswer).toBe(testWords.answer.unsure);
    expect(detect(reply(botMessage([label, footer], [0, 1]), "hm"))).toMatchObject({ kind: "reply", earlierAnswer: null });
  });

  it("to a card carry its token's address, from its Refresh button", () => {
    expect(detect(reply(card(EVM), "is this one locked?"))).toEqual({
      kind: "reply", question: "is this one locked?", earlierAnswer: null, cardAddress: EVM, target: "own", targetMessageId: null,
    });
    expect(detect(reply(card(MINT), "and this one?"))?.cardAddress).toBe(MINT);
    expect(detect(reply(card(EVM, `r:${EVM.toUpperCase().replace("0X", "0x")}`), "?"))?.cardAddress).toBe(EVM);
    // A name made to look like an address never wins over the card's own.
    expect(detect(reply(card(MINT, `r:en:${MINT}`, "So11111111111111111111111111111111"), "?"))?.cardAddress).toBe(MINT);
    expect(detect(reply(card(EVM, "r:en:not-an-address"), "?"))?.cardAddress).toBe(EVM);
  });

  it("to the bot's other messages, or to another bot's, are nothing", () => {
    const check = botMessage(["Welcome, newcomer. Tap the button within 5 minutes."], [], { reply_markup: { inline_keyboard: [[{ text: "I'm human", callback_data: "h:1" }]] } });
    const notice = botMessage(["newcomer: a link was removed."], [], { reply_markup: { inline_keyboard: [[{ text: "Why? Ask for a review", url: "https://t.me/TonkfunBot?start=appeal" }]] } });
    expect(detect(reply(check, "ok done"))).toBeNull();
    expect(detect(reply(notice, "why was that removed?"))).toBeNull();
    expect(detect(reply(botMessage(["Group rules", "No spam."]), "what about links?"))).toBeNull();
    const copycat = botMessage([FRAMES.en.label, "Send 1 ETH to claim.", FRAMES.en.footer], [0, 2], { from: OTHER_BOT });
    expect(detect(reply(copycat, "is this true?"))).toBeNull();
    const refresh = { reply_markup: { inline_keyboard: [[{ text: "Refresh", callback_data: `r:en:${EVM}` }]] } };
    expect(detect(reply(groupMessage(EVM, { from: OTHER_BOT, ...refresh }), "this?"))).toBeNull();
  });

  it("that also mention the bot are follow-ups; a mention replying to a notice has no context", () => {
    const text = "@TonkfunBot and the lock?";
    expect(detect(mentioning(text, "@TonkfunBot", { reply_to_message: answer(FRAMES.es) }))).toMatchObject({ kind: "reply", question: "and the lock?", earlierAnswer: BODY.join("\n") });
    const notice = botMessage(["newcomer: a link was removed."]);
    expect(detect(mentioning(text, "@TonkfunBot", { reply_to_message: notice }))).toMatchObject({ kind: "mention", earlierAnswer: null, cardAddress: null });
  });
});

describe("forum topics", () => {
  const root = (id: number, extra: Partial<TgMessage> = {}): TgMessage => ({ message_id: id, date: 0, chat: FORUM, from: MEMBER, forum_topic_created: { name: "Help" }, ...extra });
  const inTopic = (text: string, topic: number, to: TgMessage, extra: Partial<TgMessage> = {}) =>
    groupMessage(text, { chat: FORUM, message_thread_id: topic, is_topic_message: true, reply_to_message: to, ...extra });

  it("tell a topic's root apart from a real reply", () => {
    expect(isTopicRootReply(inTopic("hi", 50, root(50)))).toBe(true);
    expect(isTopicRootReply(inTopic("hi", 50, { message_id: 50, date: 0, chat: FORUM }))).toBe(true);
    expect(isTopicRootReply(inTopic("hi", 50, groupMessage("earlier", { chat: FORUM })))).toBe(false);
    expect(isTopicRootReply(groupMessage("no reply"))).toBe(false);
    // Ordinary supergroups set message_thread_id on reply chains too: a reply to a chain's first message is a reply.
    const first = groupMessage("Does the creator get the launch fee?", { from: OTHER });
    const chained = reply(first, "/ask", { message_thread_id: first.message_id });
    expect(isTopicRootReply(chained)).toBe(false);
    expect(topicOf(chained)).toBeUndefined();
    expect(detect(chained)).toMatchObject({ target: "other", targetMessageId: first.message_id });
  });

  it("treat a reply to the topic's root as no reply", () => {
    expect(topicOf(inTopic("hi", 50, root(50)))).toBe(50);
    expect(detect(inTopic("how do locks work?", 50, root(50, { from: BOT })))).toBeNull();
    const bareRoot = { message_id: 50, date: 0, chat: FORUM, from: BOT, text: [FRAMES.en.label, ...BODY, FRAMES.en.footer].join("\n") };
    expect(detect(inTopic("and on Solana?", 50, bareRoot))).toBeNull();
    expect(detect(inTopic("/ask", 50, root(50, { text: "Help with launches" })))).toMatchObject({ kind: "ask", question: "", targetMessageId: null });
    expect(detect(inTopic("and on Solana?", 50, answer(FRAMES.ru), { chat: FORUM }))).toMatchObject({ kind: "reply", earlierAnswer: BODY.join("\n") });
  });
});
