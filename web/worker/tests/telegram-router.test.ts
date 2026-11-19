import { describe, expect, it } from "vitest";
import { en } from "../src/telegram/i18n/en";
import { handleUpdate, parseCommand } from "../src/telegram/router";
import type { TgChat, TgMessage, TgUpdate } from "../src/telegram/types";
import { NOW } from "./fixtures";
import { callbacks, context, SITE, SOL_MINT, urls, WALLET, WHOA } from "./telegram-fixtures";

const ME: TgChat = { id: 42, type: "private" };
const GROUP: TgChat = { id: -100123, type: "supergroup" };
let nextId = 1;

function message(text: string | undefined, chat: TgChat = ME, extra: Partial<TgMessage> = {}): TgUpdate {
  const id = nextId++;
  return { update_id: id, message: { message_id: id, date: NOW / 1000, chat, from: { id: 7, language_code: "en" }, text, ...extra } };
}

function press(data: string, chat: TgChat = ME, options: { id?: string; lang?: string; user?: number } = {}): TgUpdate {
  const id = nextId++;
  return { update_id: id, callback_query: { id: options.id ?? `cb${id}`, from: { id: options.user ?? 7, language_code: options.lang }, data, message: { message_id: 99, date: NOW / 1000, chat } } };
}

describe("commands", () => {
  it("reads commands, and ignores those meant for another bot", () => {
    expect(parseCommand("/check 0xabc", "tonkfun_bot")).toEqual({ name: "check", arg: "0xabc" });
    expect(parseCommand("/Check@TonkFun_Bot  x ", "tonkfun_bot")).toEqual({ name: "check", arg: "x" });
    expect(parseCommand("/check@other_bot x", "tonkfun_bot")).toBe("other");
    expect(parseCommand("hello", "tonkfun_bot")).toBeNull();
  });
});

describe("a private chat", () => {
  it("answers /start with the home menu, and a deep link with the token's card", async () => {
    const { ctx, got } = context();
    await handleUpdate(message("/start"), ctx);
    await handleUpdate(message(`/start c_${WHOA}`), ctx);
    expect(callbacks(got.sent[0].view)).toEqual(["check", "l:tonk", "ref", "help"]);
    expect(got.sent[1].view.text).toContain("<b>Whoa the Tarsier</b>");
  });

  it("turns any message holding an address into a card, captions included, and anything else into a hint", async () => {
    const { ctx, got } = context();
    await handleUpdate(message(`what about https://www.tonkfun.fun/token/${WHOA}?`), ctx);
    await handleUpdate(message(SOL_MINT), ctx);
    await handleUpdate(message("hi"), ctx);
    await handleUpdate(message(undefined, ME, { caption: `CA: ${WHOA}`, photo: [{}] }), ctx);
    await handleUpdate(message(undefined, ME, { sticker: {} }), ctx);
    await handleUpdate(message(undefined, ME, { photo: [{}], media_group_id: "album1" }), ctx);
    await handleUpdate(message(undefined, ME, { audio: {} }), ctx);
    expect(got.sent[0].view.text).toContain("Mission score <b>78</b>");
    expect(got.sent[1].view.text).toContain(en.check.notFound);
    expect(urls(got.sent[1].view)).toEqual([`${SITE}/`]);
    expect(got.sent[2].view.text).toContain(en.check.notAddress);
    expect(got.sent[3].view.text).toContain("<b>Whoa the Tarsier</b>");
    expect(got.sent[4].view.text).toContain(en.check.notAddress);
    expect(got.sent).toHaveLength(6);
    expect(got.sent[5].view.text).toContain(en.check.notAddress);
  });

  it("asks for an address with a reply prompt when /check has none", async () => {
    const { ctx, got } = context();
    await handleUpdate(message("/check"), ctx);
    expect(got.sent[0].view.forceReply?.force_reply).toBe(true);
  });

  it("makes a referral link from the command, or from a reply to its prompt, and refuses a token's address", async () => {
    const { ctx, got } = context();
    await handleUpdate(message(`/referral ${WALLET}`), ctx);
    await handleUpdate(message("/referral"), ctx);
    const prompt: TgMessage = { message_id: 5, date: NOW / 1000, chat: ME, from: { id: 1, is_bot: true }, text: en.referral.prompt };
    await handleUpdate(message(WALLET.toUpperCase().replace("0X", "0x"), ME, { reply_to_message: prompt }), ctx);
    await handleUpdate(message("not a wallet", ME, { reply_to_message: prompt }), ctx);
    await handleUpdate(message(WHOA, ME, { reply_to_message: prompt }), ctx);
    expect(got.sent[0].view.text).toContain(`?ref=${WALLET}`);
    expect(got.sent[1].view.forceReply?.force_reply).toBe(true);
    expect(got.sent[2].view.text).toContain(`?ref=${WALLET}`);
    expect(got.sent[3].view.text).toBe(en.referral.notWallet);
    expect(got.sent[4].view.text).toBe(en.referral.isToken);
  });

  it("lists launches and helps", async () => {
    const { ctx, got } = context();
    await handleUpdate(message("/launches"), ctx);
    await handleUpdate(message("/help"), ctx);
    expect(got.sent[0].view.text).toContain("<b>Latest launches</b>");
    expect(got.sent[1].view.text).toContain("<b>How it works</b>");
    expect(got.sent[1].view.text).toContain("@tonkfun_bot");
  });

  it("leaves the inline tip out of help while inline mode is off", async () => {
    const { ctx, got } = context();
    await handleUpdate(message("/help"), { ...ctx, inline: () => false });
    expect(got.sent[0].view.text).not.toContain("@tonkfun_bot");
  });

  it("stays quiet for old messages, other bots and the 9th action in 10 seconds", async () => {
    const { ctx, got } = context();
    await handleUpdate(message("/start", ME, { date: NOW / 1000 - 301 }), ctx);
    await handleUpdate(message("/start", ME, { from: { id: 9, is_bot: true } }), ctx);
    expect(got.sent).toHaveLength(0);
    for (let i = 0; i < 9; i++) await handleUpdate(message("/start"), ctx);
    expect(got.sent).toHaveLength(8);
  });

  it("says when live data isn't ready yet", async () => {
    const { ctx, got } = context({ ready: () => false });
    await handleUpdate(message(WHOA), ctx);
    expect(got.sent[0].view.text).toBe(en.common.unavailable);
  });
});

describe("a group", () => {
  it("answers only its commands, replying to the asker, with links in no one language", async () => {
    const { ctx, got } = context();
    await handleUpdate(message(WHOA, GROUP), ctx);
    await handleUpdate(message("/launches", GROUP), ctx);
    await handleUpdate(message(`/check@other_bot ${WHOA}`, GROUP), ctx);
    expect(got.sent).toHaveLength(0);
    const ask = message(`/check@tonkfun_bot ${WHOA}`, GROUP, { from: { id: 8, language_code: "de" } });
    await handleUpdate(ask, ctx);
    await handleUpdate(message("/check", GROUP), ctx);
    expect(got.sent[0].view.text).toContain("<b>Whoa the Tarsier</b>");
    expect(got.sent[0].replyTo).toBe(ask.message?.message_id);
    expect(urls(got.sent[0].view)[0]).toBe(`${SITE}/token/${WHOA}`);
    expect(callbacks(got.sent[0].view)).toEqual([`r:de:${WHOA}`]);
    expect(got.sent[1].view.text).toBe(en.check.groupUsage);
  });

  it("checks the address in the message a /check replies to", async () => {
    const { ctx, got } = context();
    const original: TgMessage = { message_id: 3, date: NOW / 1000, chat: GROUP, from: { id: 5 }, text: `new CA ${WHOA}` };
    await handleUpdate(message("/check@tonkfun_bot", GROUP, { reply_to_message: original }), ctx);
    expect(got.sent[0].view.text).toContain("<b>Whoa the Tarsier</b>");
  });

  it("answers an anonymous admin, counting them by their chat", async () => {
    const { ctx, got } = context();
    await handleUpdate(message(`/check@tonkfun_bot ${WHOA}`, GROUP, { from: { id: 1087968824, is_bot: true }, sender_chat: GROUP }), ctx);
    expect(got.sent).toHaveLength(1);
  });
});

describe("buttons", () => {
  it("answers each press first, then edits menus in place and sends cards and prompts", async () => {
    const { ctx, got } = context();
    for (const data of ["home", "help", "l:tonk", "l:trend", `r:en:${WHOA}`, `c:${WHOA}`, "check", "ref"]) await handleUpdate(press(data), ctx);
    expect(got.answers).toHaveLength(8);
    expect(got.answers[4].text).toBe(en.card.refreshed);
    expect(got.edits.map((e) => e.view.text.split("\n")[0])).toEqual(["<b>tonkfun.fun</b>", "<b>How it works</b>", "<b>Latest launches</b>", "<b>Trending now</b>", "<b>Whoa the Tarsier</b> · WHOA"]);
    expect(got.sent).toHaveLength(3);
    expect(got.sent[1].view.forceReply && got.sent[2].view.forceReply).toBeTruthy();
  });

  it("refreshes a card in its own language, whoever presses it", async () => {
    const { ctx, got } = context();
    await handleUpdate(press(`r:en:${WHOA}`, GROUP, { lang: "ru" }), ctx);
    expect(got.edits[0].view.text).toContain("Mission score");
    expect(got.answers[0].text).not.toBe(en.card.refreshed);
    await handleUpdate(press(`r:${WHOA}`, ME, { lang: "de" }), ctx);
    expect(got.edits[1].view.text).not.toContain("Mission score");
  });

  it("refreshes a card sent through inline mode by its inline id", async () => {
    const { ctx, got } = context();
    await handleUpdate({ update_id: 1, callback_query: { id: "q", from: { id: 7 }, data: `r:en:${WHOA}`, inline_message_id: "IM1" } }, ctx);
    expect(got.edits[0].target).toEqual({ inlineId: "IM1" });
  });

  it("doesn't act on a press Telegram no longer accepts, nor change a message while data is missing", async () => {
    const { ctx, got } = context();
    await handleUpdate(press(`c:${WHOA}`, ME, { id: "old1" }), ctx);
    await handleUpdate(press("check", ME, { id: "old2" }), ctx);
    expect(got.sent).toHaveLength(0);
    const empty = context({ ready: () => false });
    await handleUpdate(press(`r:en:${WHOA}`), empty.ctx);
    expect(empty.got.edits).toHaveLength(0);
    expect(empty.got.answers[0].text).toBe(en.common.unavailable);
  });

  it("tells a person pressing too fast to wait a moment", async () => {
    const { ctx, got } = context();
    for (let i = 0; i < 9; i++) await handleUpdate(press("home"), ctx);
    expect(got.answers.at(-1)?.text).toBe(en.common.slowDown);
  });
});

describe("inline mode", () => {
  it("offers the card for an address, and says when it doesn't know one", async () => {
    const { ctx, got } = context();
    await handleUpdate({ update_id: 1, inline_query: { id: "i1", from: { id: 7 }, query: WHOA } }, ctx);
    await handleUpdate({ update_id: 2, inline_query: { id: "i2", from: { id: 7 }, query: "pepe" } }, ctx);
    await handleUpdate({ update_id: 3, inline_query: { id: "i3", from: { id: 7 }, query: SOL_MINT } }, ctx);
    expect(got.inline[0].results[0].title).toBe("Whoa the Tarsier · WHOA");
    expect(got.inline[0].results[0].input_message_content.parse_mode).toBe("HTML");
    expect(got.inline[1].results).toEqual([]);
    expect(got.inline[1].help).toBe(en.inline.help);
    expect(got.inline[2].help).toBe(en.inline.notFound);
  });

  it("keeps to a shared budget of answers a second", async () => {
    const { ctx, got } = context();
    for (let user = 1; user <= 12; user++) await handleUpdate({ update_id: user, inline_query: { id: `q${user}`, from: { id: user }, query: WHOA } }, ctx);
    expect(got.inline).toHaveLength(10);
  });
});
