// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/shared/i18n/config";
import { MAX_QUESTION } from "../src/telegram/community/qa-reply";
import type { CommunityHooks } from "../src/telegram/community/types";
import { BOT_DICTIONARIES } from "../src/telegram/i18n";
import { en } from "../src/telegram/i18n/en";
import { ASK_CHARS, askArticle, askQuestion } from "../src/telegram/inline";
import { handleUpdate } from "../src/telegram/router";
import { SEED } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { context, stubHooks, WHOA } from "./telegram-fixtures";
import { answerTo, ASK_G, ASK_LINE, ASK_P, asking, query } from "./telegram-inline-fixtures";

/**
 * Inline mode's Ask result (inline.ts): a message that starts with @bot is
 * an inline query, which Telegram can't send, so a question gets an "Ask
 * TonkFun" result, titled with the question, that posts only a fixed line
 * in the asker's language. The question reaches the bot alone, through the
 * chosen result (telegram-inline-pending.test.ts); what the post does is in
 * community-pipeline-inline-ask.test.ts and telegram-router-private-ask.test.ts,
 * where and how often Ask is offered in telegram-inline-limits.test.ts.
 */

describe("inline mode's Ask result", () => {
  it("offers Ask TonkFun in the asker's language, titled with the question, posting only the fixed line as plain text without buttons", async () => {
    const { ctx, got } = asking();
    await handleUpdate(query("what is the launch fee?", "supergroup", "de"), ctx);
    const de = BOT_DICTIONARIES.de.inline;
    expect(got.inline[0].results).toStrictEqual([{
      type: "article", id: ASK_G, title: "TonkFun fragen: what is the launch fee?", description: de.askWhere,
      input_message_content: { message_text: de.askPosted, link_preview_options: { is_disabled: true } },
    }]);
    expect(got.inline[0].help).toBe(de.help);
  });

  it("names in its ID the kind of chat it is offered in, which the chosen result tells nowhere else: a supergroup or the bot's own chat", async () => {
    const ids = async (chatType: string, on: { ai: boolean; groupAi: boolean }) => {
      const community: CommunityHooks = { ...stubHooks({ ai: on.ai }), groupAi: () => on.groupAi };
      const { ctx, got } = context({}, NOW, { community });
      await handleUpdate(query("what is the launch fee?", chatType), ctx);
      return got.inline[0].results.map((r) => r.id);
    };
    for (const on of [{ ai: true, groupAi: true }, { ai: false, groupAi: true }]) expect(await ids("supergroup", on), JSON.stringify(on)).toEqual([ASK_G]);
    for (const on of [{ ai: true, groupAi: true }, { ai: true, groupAi: false }]) expect(await ids("sender", on), JSON.stringify(on)).toEqual([ASK_P]);
    expect([askArticle("fees?", "en", "g").id, askArticle("fees?", "en", "p").id]).toEqual(["ask:g", "ask:p"]);
  });

  it("posts the same line in each language whatever was typed: never the question, a link, a handle or a number", () => {
    for (const { code } of LOCALES) {
      const typed = ["is https://tonkfun-claim.xyz real?", "DM @tonk_support for help?", "is +1 800 555 0199 support?"];
      const posted = typed.map((q) => askArticle(q, code, "g").input_message_content);
      expect(posted.map((p) => p.message_text), code).toEqual(typed.map(() => BOT_DICTIONARIES[code].inline.askPosted));
      for (const p of posted) expect([p.parse_mode, p.link_preview_options], code).toEqual([undefined, { is_disabled: true }]);
    }
    expect(askArticle("anything?", "en", "p")).not.toHaveProperty("reply_markup");
    expect(ASK_LINE).toBe("Asked TonkFun a question.");
  });

  it("titles it in every language with the name /help says to tap, then the question", () => {
    for (const { code } of LOCALES) {
      const { title } = askArticle("wen launch?", code, "g");
      expect(title.startsWith(BOT_DICTIONARIES[code].inline.ask), code).toBe(true);
      expect(title.endsWith(" wen launch?") || title.endsWith("：wen launch?"), code).toBe(true);
    }
    expect(askArticle("why $& and $1?", "ja", "p").title).toBe("TonkFun に質問する：why $& and $1?");
  });

  it("says where it answers by what is on: the community groups and private chats, or only one of them", async () => {
    for (const { code } of LOCALES) {
      const d = BOT_DICTIONARIES[code].inline;
      expect((["both", "group", "private"] as const).map((where) => askArticle("fees?", code, "g", where).description), code).toEqual([d.askWhere, d.askWhereGroup, d.askWherePrivate]);
    }
    const description = async (chatType: string, on: { ai: boolean; groupAi: boolean }) => {
      const community: CommunityHooks = { ...stubHooks({ ai: on.ai }), groupAi: () => on.groupAi };
      const { ctx, got } = context({}, NOW, { community });
      await handleUpdate(query("what is the launch fee?", chatType), ctx);
      return got.inline[0].results[0]?.description;
    };
    expect(await description("supergroup", { ai: true, groupAi: true })).toBe(en.inline.askWhere);
    expect(await description("sender", { ai: true, groupAi: true })).toBe(en.inline.askWhere);
    expect(await description("supergroup", { ai: false, groupAi: true })).toBe(en.inline.askWhereGroup);
    expect(await description("sender", { ai: true, groupAi: false })).toBe(en.inline.askWherePrivate);
  });

  it("keeps an address's card exactly as before, and never offers Ask beside it", async () => {
    const { ctx, got } = asking();
    await handleUpdate(query(`what is ${WHOA}?`), ctx);
    await handleUpdate(query("is 0x2222222222222222222222222222222222222222 safe to buy?"), ctx);
    // No address as typed, but one once the invisible character is dropped: neither a card nor Ask.
    await handleUpdate(query(`0x${"1".repeat(20)}​${"2".repeat(20)} is this the token?`), ctx);
    expect(got.inline[0].results.map((r) => r.id)).toEqual([WHOA]);
    expect(got.inline[0].results[0].input_message_content.parse_mode).toBe("HTML");
    expect(got.inline[0].results[0].reply_markup).toBeDefined();
    expect(got.inline[0].help).toBe(en.inline.help);
    expect(got.inline[1]).toMatchObject({ results: [], help: en.inline.notFound });
    expect(got.inline[2]).toMatchObject({ results: [], help: en.inline.help });
  });
});

describe("the question Ask stands for (inline-ask.ts askQuestion)", () => {
  it("is one that reads as a question in any of the 12 languages, or has 3 words or more, in a supergroup and the bot's own chat alike", async () => {
    const questions = ["fees?", "wen moon", "wie geht's", "费用是多少", "ロックとは何", "how much", "/ask what is the fee", "tell me about locks", "is the dev doxxed"];
    expect(questions.map((text) => askQuestion(text))).toEqual(questions.map((text) => ({ question: text })));
    for (const [chatType, id] of [["supergroup", ASK_G], ["sender", ASK_P]]) expect((await answerTo("tell me about locks", chatType)).results.map((r) => r.id), chatType).toEqual([id]);
  });

  it("is none for chit-chat under 3 words, nothing but signs, or an address: the usual help", async () => {
    const chatter = ["gm", "hi there", "lol ok", "???", "", "  ​ ", `${WHOA}?`];
    expect(chatter.map((text) => askQuestion(text))).toEqual(chatter.map(() => ({ refused: "none" })));
    expect(askQuestion(undefined)).toEqual({ refused: "none" });
    expect(await answerTo("lol ok", "sender")).toMatchObject({ results: [], help: en.inline.help });
  });

  it("is visible text, as an answer takes it", () => {
    expect(askQuestion("how\n\n do  locks‮ work?")).toEqual({ question: "how do locks work?" });
    expect(ASK_CHARS).toBe(MAX_QUESTION);
  });

  it("gets no Ask, and the button that says to use /ask, for a query Telegram cut at 256 characters or one holding a recovery phrase or key", async () => {
    const cut = `why is ${"the fee ".repeat(40)}`;
    expect(cut.length).toBeGreaterThanOrEqual(256);
    expect(askQuestion(cut.slice(0, 255))).toHaveProperty("question");
    const KEY = "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
    for (const text of [cut, `is this phrase ok? ${SEED}`, `my private key is ${KEY}, is it safe?`, `is it ok? ${SEED.split(" ").join("​ ")}`]) {
      expect(askQuestion(text), text.slice(0, 40)).toEqual({ refused: "unsafe" });
      expect(await answerTo(text), text.slice(0, 40)).toMatchObject({ results: [], help: en.inline.askNo });
    }
  });
});
