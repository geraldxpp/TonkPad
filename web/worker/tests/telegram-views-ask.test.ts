import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "@/shared/i18n/config";
import { rulesTemplate } from "../src/telegram/agent/prompt-rules";
import { BOT_DICTIONARIES } from "../src/telegram/i18n";
import { COMMUNITY_DICTIONARIES } from "../src/telegram/i18n/community";
import { en } from "../src/telegram/i18n/en";
import { askLine, helpView } from "../src/telegram/views";
import { callbacks, SITE, urls } from "./telegram-fixtures";

const CODES: Locale[] = LOCALES.map((l) => l.code);
const community = COMMUNITY_DICTIONARIES.en;

/**
 * How /help says to ask the AI (views.ts askLine), and what the model is
 * told about it (agent/prompt-rules.ts ABOUT): /ask first, Ask TonkFun as it
 * works (it posts a short fixed line, and the answer replies to it), and no
 * claim that new members can't use Ask TonkFun. Observe mode, where a group
 * starts, leaves them free to; outside it, their text-only days close every
 * inline bot in the group, by Telegram's own rule, not the bot's.
 */
describe("how to ask, in /help and in the model's facts", () => {
  it("help says how to ask, that answers are AI's and can be wrong, and links the privacy policy, while AI answers are on", () => {
    const full = helpView("de", SITE, { group: false, bot: "tonkfun_bot", ai: true });
    const de = COMMUNITY_DICTIONARIES.de;
    expect(full.text).toContain(`• ${askLine("de", false, "tonkfun_bot")}`);
    expect(full.text).toContain(de.help.ai);
    expect(full.text).not.toContain(askLine("de", true, "tonkfun_bot"));
    expect(urls(full)).toEqual([`${SITE}/de/docs`, `${SITE}/de/privacy/telegram`, `${SITE}/de`]);
    expect(callbacks(full)).toEqual(["home"]);
    const group = helpView("en", SITE, { group: true, bot: "tonkfun_bot", ai: true });
    expect(group.text).toContain(askLine("en", true, "tonkfun_bot"));
    expect(group.text).toContain(community.help.ai);
    expect(group.text).not.toContain(askLine("en", false, "tonkfun_bot"));
    expect(urls(group)).toEqual([`${SITE}/`, `${SITE}/privacy/telegram`]);
    expect(group.keyboard?.inline_keyboard.flat().map((b) => b.text)).toContain(community.help.privacy);
  });

  it("names every way to ask while inline mode is on, and the lines without it while it is off", () => {
    // A message that starts with @bot is an inline query Telegram can't send: the line names the Ask result and a mention anywhere but first.
    // Ask TonkFun posts only its fixed line (inline.askPosted), and the answer replies to it (inline-pending.ts, community/qa-posted.ts).
    expect(askLine("en", true, "TonkfunBot")).toBe(
      "In the community group, send /ask and your question, reply to one of my answers or mention me anywhere but at the start. You can also type @TonkfunBot and your question, then tap “Ask TonkFun”: that posts a short note that you asked, and my answer replies to it.",
    );
    expect(askLine("en", false, "TonkfunBot")).toBe(
      "Ask me anything about tonkfun.fun: send /ask and your question, or type @TonkfunBot and your question, then tap “Ask TonkFun”. That posts a short note that you asked, and my answer replies to it. In the community group you can also reply to one of my answers or mention me anywhere but at the start.",
    );
    // Inline mode off: the bot's username is unknown here, there is no Ask result to tap, and a message may start with a mention.
    expect(askLine("en", true, null)).toBe("In the community group, send /ask and your question, reply to one of my answers or mention me.");
    expect(askLine("en", false, null)).toBe("Ask me anything about tonkfun.fun: send /ask and your question.");
    const off = helpView("en", SITE, { group: true, bot: null, ai: true });
    expect(off.text).toContain(`• ${community.help.groupAskNoInline}`);
    expect(off.text).not.toContain(en.inline.ask);
  });

  it.each(CODES)("%s names /ask first, then inline mode's Ask result as the bot titles it, with every placeholder filled", (code) => {
    for (const group of [true, false]) {
      const line = askLine(code, group, "TonkfunBot");
      expect(line, `${group}`).toContain(BOT_DICTIONARIES[code].inline.ask);
      expect(line.indexOf("/ask"), `${group}`).toBeGreaterThanOrEqual(0);
      expect(line.indexOf("/ask"), `${group}`).toBeLessThan(line.indexOf("@TonkfunBot"));
      expect(line, `${group}`).not.toMatch(/\{\w+\}/);
    }
    // Without inline mode the group line names /ask first too, before a reply or a mention (the private line names /ask alone).
    const plain = askLine(code, true, null);
    expect(plain.indexOf("/ask")).toBeGreaterThanOrEqual(0);
    expect(plain.indexOf("/ask")).toBeLessThan(plain.length / 2);
    expect(askLine(code, false, null)).toContain("/ask");
  });

  it("tells the model every way members ask, Ask TonkFun in both chats included, and nothing about new members", () => {
    const rules = rulesTemplate();
    expect(rules).toContain(
      "or typing your handle and the question, then tapping Ask TonkFun (named in their app's language), which posts only a short fixed line saying they asked, never the question, and your answer replies to that line. In a private chat: /ask and the question, Ask TonkFun the same way, or any question, then the Ask button.",
    );
    expect(rules).not.toMatch(/new members in their first days|can't use inline bots/);
  });

  it("tells the model a reply asks only on its answers and the cards it posted itself, never on a card a member shared through inline mode", () => {
    // agent/triggers.ts baseOf: the replied-to message must be the bot's own (from.id); a member's inline card is theirs, via the bot.
    expect(rulesTemplate()).toContain(
      "a reply to one of your answers, or to a token card you posted yourself for /check (a reply to a card a member shared through inline mode asks nothing);",
    );
    expect(rulesTemplate()).not.toContain("a reply to one of your answers or cards");
  });
});
