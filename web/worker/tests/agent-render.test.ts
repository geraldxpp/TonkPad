import { describe, expect, it } from "vitest";
import { DOC_SECTIONS } from "@/modules/docs/lib/sections";
import { LOCALES, type Locale } from "@/shared/i18n/config";
import type { Gated } from "../src/telegram/agent/gate";
import { type AnswerViewOptions, answerLabels, answerView, crisisView, dmWarningView, fallbackView, LINK_PATHS, scoreLine } from "../src/telegram/agent/render";
import type { LinkKey, ToolToken } from "../src/telegram/agent/types";
import { DEFAULT_HELPLINE_URL } from "../src/telegram/community/config";
import type { CommunityDictionary } from "../src/telegram/community/words";
import { testWords } from "./community-fixtures";
import { callbacks, SITE, urls, WHOA } from "./telegram-fixtures";

const BOT = "TonkfunBot";
const REFERRAL = `https://t.me/${BOT}?start=ref`;
const gated = (text: string, links: LinkKey[] = [], extra: Partial<Gated> = {}): Gated => ({ text, lang: "en", links, blocked: null, ...extra });
const options = (extra: Partial<AnswerViewOptions> = {}): AnswerViewOptions => ({
  shared: false,
  lang: "en",
  scoreLine: null,
  tokenButton: null,
  dmWarning: false,
  extra: null,
  shareData: null,
  ...extra,
});
const view = (g: Gated, extra: Partial<AnswerViewOptions> = {}, words: CommunityDictionary = testWords) => answerView(g, words, SITE, BOT, options(extra));
const lines = (text: string) => text.split("\n");
/** A language's words, told apart by their label and footer. */
const wordsFor = (lang: Locale): CommunityDictionary => ({
  ...testWords,
  answer: { ...testWords.answer, label: `AI answer (${lang})`, footer: `AI · can be wrong · not financial advice (${lang})` },
});

/** A token as get_token returns it. */
const TOKEN: ToolToken = {
  address: WHOA,
  name: "Whoa the Tarsier",
  ticker: "WHOA",
  nameHidden: false,
  launchpad: "tonkfun.fun",
  chain: "Robinhood Chain",
  score: 78.4,
  level: "Safe",
  badges: ["Locked"],
  marketCapUsd: 21_400,
  change24h: 12.4,
  curvePct: 41,
  graduated: false,
  holders: 37,
  ageMinutes: 7_200,
  launch: null,
};
const SCORE = "Mission score 78 · Safe: a rating of chain facts, not a promise";

describe("answer links", () => {
  it("links each Docs section by its anchor, in the page's order", () => {
    const sections = Object.entries(LINK_PATHS).filter(([key]) => key.startsWith("docs_"));
    for (const [key, path] of sections) expect(path).toBe(`/docs#${key.slice("docs_".length)}`);
    expect(sections.map(([key]) => key.slice("docs_".length))).toEqual([...DOC_SECTIONS]);
    expect(LINK_PATHS).toMatchObject({ docs: "/docs", explore: "/", privacy: "/privacy/telegram" });
  });

  it("points buttons only to the site, the bot's own list and its referral start link", () => {
    const all = [...Object.keys(LINK_PATHS), "launches", "referral"] as LinkKey[];
    const v = view(gated("On fees: every trade pays a 1% protocol fee.", all), { tokenButton: WHOA, shareData: "77" });
    expect(urls(v).length).toBeGreaterThan(5);
    for (const url of urls(v)) expect(url.startsWith(`${SITE}/`) || url === REFERRAL, url).toBe(true);
    expect(urls(v)).toContain(REFERRAL);
    expect(callbacks(v)).toEqual(["l:tonk", "s:77"]);
  });

  it("links the site in the asker's language in a private chat, and unprefixed in a group", () => {
    const g = gated("See the fees.", ["docs_fees", "explore"]);
    expect(urls(view(g, { lang: "es" }))).toEqual([`${SITE}/es/docs#fees`, `${SITE}/es`]);
    expect(urls(view(g, { lang: "es", shared: true }))).toEqual([`${SITE}/docs#fees`, `${SITE}/`]);
  });

  it("shows no token, referral or Share button in a group", () => {
    const v = view(gated("See your link.", ["referral", "docs"]), { shared: true, tokenButton: WHOA, shareData: "77", extra: "shareAsk" });
    expect(urls(v)).toEqual([`${SITE}/docs`]);
    expect(callbacks(v)).toEqual([]);
  });

  it("links the asker's token in a private chat, for a token address only", () => {
    expect(urls(view(gated("On WHOA."), { tokenButton: WHOA.toUpperCase().replace("0X", "0x"), lang: "pt" }))).toEqual([`${SITE}/pt/token/${WHOA}`]);
    expect(view(gated("On WHOA."), { tokenButton: "not an address" }).keyboard).toBeUndefined();
  });

  it("needs a real bot username for the referral link, and shows one Docs button for two sections", () => {
    expect(answerView(gated("Your link.", ["referral"]), testWords, SITE, null, options()).keyboard).toBeUndefined();
    expect(answerView(gated("Your link.", ["referral"]), testWords, SITE, "t.me/x", options()).keyboard).toBeUndefined();
    expect(urls(view(gated("See both.", ["docs_fees", "docs_tax", "launch"])))).toEqual([`${SITE}/docs#fees`, `${SITE}/launch`]);
  });

  it("leaves out a button without a label, which Telegram would refuse", () => {
    const words = { ...testWords, links: { ...testWords.links, docs: " " } };
    expect(view(gated("See the fees.", ["docs"]), {}, words).keyboard).toBeUndefined();
    expect(urls(view(gated("See the fees.", ["docs_fees", "swap"]), {}, words))).toEqual([`${SITE}/swap`]);
  });

  it("offers Share in a private chat only, with data Telegram accepts", () => {
    expect(callbacks(view(gated("I can share this."), { shareData: "123" }))).toEqual(["s:123"]);
    expect(callbacks(view(gated("I can share this."), { shareData: "9".repeat(80) }))).toEqual([]);
    expect(callbacks(view(gated("I can share this."), { shareData: "a b" }))).toEqual([]);
  });

  it("adds the Security page to the flaw and business notes", () => {
    expect(urls(view(gated("Thanks."), { extra: "flaw", lang: "de" }))).toEqual([`${SITE}/de/security`]);
    expect(urls(view(gated("Thanks."), { extra: "business", shared: true }))).toEqual([`${SITE}/security`]);
  });
});

describe("answer text", () => {
  it("puts the italic label first and no footer (the owner removed it, 26 Nov 2026), in every language", () => {
    for (const { code } of LOCALES) {
      const words = wordsFor(code);
      const text = view(gated("On fees: every trade pays a 1% protocol fee."), { lang: code, scoreLine: SCORE, dmWarning: true, extra: "escalated" }, words).text;
      expect(lines(text)[0]).toBe(`<i>${words.answer.label}</i>`);
      expect(lines(text).at(-1)).toBe(words.answer.escalated);
      expect(text).not.toContain(words.answer.footer);
      expect(text.match(/<\/?i>/g)).toEqual(["<i>", "</i>"]);
    }
  });

  it("writes the escaped text, then the score line, the DM warning and the note", () => {
    const text = view(gated("Fees <b>&</b> more."), { scoreLine: scoreLine(TOKEN, testWords, "Safe"), dmWarning: true, extra: "escalated" }).text;
    expect(lines(text)).toEqual([
      `<i>${testWords.answer.label}</i>`,
      "Fees &lt;b&gt;&amp;&lt;/b&gt; more.",
      "",
      SCORE,
      testWords.safety.dmWarning,
      testWords.answer.escalated,
    ]);
  });

  it("writes the score line from the tool's data", () => {
    expect(scoreLine(TOKEN, testWords, "Safe")).toBe(SCORE);
    expect(scoreLine({ ...TOKEN, score: 140 }, testWords, "Seguro")).toBe("Mission score 100 · Seguro: a rating of chain facts, not a promise");
  });

  it("stays within Telegram's 4,096 characters, whatever the text holds", () => {
    const v = view(gated(`${"&".repeat(1_000)}${"<".repeat(1_000)}`), { scoreLine: SCORE, dmWarning: true, extra: "flaw" });
    expect(v.text.length).toBeLessThanOrEqual(4_096);
    expect(lines(v.text)[0]).toBe(`<i>${testWords.answer.label}</i>`);
    expect(lines(v.text).at(-1)).toBe(testWords.answer.flaw);
    expect(v.text).toContain("&amp;&amp;…");
  });

  it("knows the bot's answers by each language's label", () => {
    const labels = answerLabels(LOCALES.map(({ code }) => wordsFor(code)));
    expect(labels.size).toBe(12);
    expect(labels.has("AI answer (ru)")).toBe(true);
  });
});

describe("fallbacks and the crisis reply", () => {
  it("shows a blocked answer as the unsure answer with a Docs button", () => {
    const v = view(gated("Guaranteed 10x.", ["swap"], { blocked: "claim" }), { lang: "es" });
    expect(lines(v.text)).toEqual([`<i>${testWords.answer.label}</i>`, testWords.answer.unsure]);
    expect(urls(v)).toEqual([`${SITE}/es/docs`]);
  });

  it("frames the unsure and refused replies like answers, and offers the Docs with those and paused", () => {
    for (const kind of ["busy", "tooLong", "textOnly", "cooldown"] as const) {
      expect(fallbackView(kind, testWords, SITE, { shared: true, lang: "en" })).toEqual({ text: testWords.answer[kind] });
    }
    expect(fallbackView("paused", testWords, SITE, { shared: true, lang: "es" })).toEqual({
      text: testWords.answer.paused,
      keyboard: { inline_keyboard: [[{ text: testWords.links.docs, url: `${SITE}/docs` }]] },
    });
    expect(lines(fallbackView("refused", testWords, SITE, { shared: false, lang: "fr" }).text)[1]).toBe(testWords.answer.refused);
  });

  it("adds the DM warning, written by code, to any fallback when asked, and can send it alone", () => {
    const warning = testWords.safety.dmWarning;
    expect(lines(fallbackView("unsure", testWords, SITE, { shared: true, lang: "en", dmWarning: true }).text)).toEqual([
      `<i>${testWords.answer.label}</i>`, testWords.answer.unsure, "", warning,
    ]);
    for (const kind of ["busy", "paused", "cooldown", "textOnly", "tooLong"] as const) {
      expect(fallbackView(kind, testWords, SITE, { shared: true, lang: "en", dmWarning: true }).text).toBe(`${testWords.answer[kind]}\n\n${warning}`);
    }
    expect(view(gated("Guaranteed.", [], { blocked: "claim" }), { dmWarning: true }).text).toContain(warning);
    expect(dmWarningView(testWords)).toEqual({ text: warning });
  });

  it("answers someone at risk with the fixed text and one helpline button, never the Docs", () => {
    const v = crisisView(testWords, "https://findahelpline.com/countries/de");
    expect(v).toEqual({ text: testWords.crisis.body, keyboard: { inline_keyboard: [[{ text: testWords.crisis.button, url: "https://findahelpline.com/countries/de" }]] } });
    expect(v.text).not.toMatch(/\d/);
    expect(urls(crisisView(testWords, "http://example.com"))).toEqual([DEFAULT_HELPLINE_URL]);
  });
});
