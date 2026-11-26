import { describe, expect, it } from "vitest";
import { MAX_ANSWER_CHARS } from "../src/telegram/agent/gate";
import { type AnswerViewOptions, answerView } from "../src/telegram/agent/render";
import type { AnswerOutput } from "../src/telegram/agent/types";
import { FACTS, fullWidth, gate, LAUNCHPAD, LOOKALIKE, PLACEHOLDER } from "./agent-gate-fixtures";
import { testWords } from "./community-fixtures";
import { SITE, SOL_MINT } from "./telegram-fixtures";

const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);
const ONE_DOT_LEADER = String.fromCodePoint(0x2024);
const IDEOGRAPHIC_FULL_STOP = String.fromCodePoint(0x3002);
const FULLWIDTH_FULL_STOP = String.fromCodePoint(0xff0e);

const GROUP: AnswerViewOptions = { shared: true, lang: "en", scoreLine: null, tokenButton: null, dmWarning: false, extra: null, shareData: null };

/** Whether Telegram could still find a link: a scheme, or a dot of any kind between letters or digits outside the names the bot may write. */
function linkable(text: string): boolean {
  const rest = text.replace(/(?<![\p{L}\p{N}.-])(?:tonkfun|pump|bonk)\.fun(?![\p{L}\p{N}-])/giu, " ");
  return /[\p{L}\p{N}][.\u2024\u3002\uFF0E\uFF61][\p{L}\p{N}]/u.test(rest) || /[a-z]+:\/\/|tg:/i.test(rest);
}

describe("the answer gate: links and entities", () => {
  it("leaves no hashtag, cashtag, mention, command, e-mail, URL or tg:// link", () => {
    const { text, blocked } = gate(
      "Join #winners and buy $SCAM. Ask @support_admin, tap /claim, open tg://resolve?domain=evil, visit https://evil.com/x or www.evil.io, write to help@evil.com, or see t.me/fakegroup.",
    );
    expect(blocked).toBeNull();
    for (const live of ["#", "$S", "@", "/claim", "tg:", "https:", "www", "evil", "t.me"]) expect(text).not.toContain(live);
    expect(text).toContain("Join winners and buy SCAM.");
  });

  it("keeps the bot's own commands, without another bot's name", () => {
    expect(gate("Send /check with the address, or /check@OtherBot.").text).toBe("Send /check with the address, or /check.");
  });

  it("leaves nothing linkable behind one-dot leaders, invisible and right-to-left marks, or look-alike domains", () => {
    const replies = [
      `Claim at tonkfun${ONE_DOT_LEADER}fun${ONE_DOT_LEADER}claim now.`,
      `Go to evi${ZERO_WIDTH_SPACE}l.com today.`,
      `Open ${RIGHT_TO_LEFT_OVERRIDE}moc.live now.`,
      "Visit tonkfun-claim.com, tonkfun.fun.evil.com, tonkfan.fun or xn--tonkfn-cxa.com.",
      `See tonkfun${IDEOGRAPHIC_FULL_STOP}com or tonkfun${FULLWIDTH_FULL_STOP}fun/claim.`,
      fullWidth("Go to evil.com/claim now."),
      "hxxps://evil[.]com and EVIL.COM",
    ];
    for (const reply of replies) expect(linkable(gate(reply).text), reply).toBe(false);
  });

  it("keeps tonkfun.fun, Pump.fun, Bonk.fun and decimals, and makes other dots inside words middle dots", () => {
    const { text, blocked } = gate("Pump.fun and Bonk.fun tokens show on tonkfun.fun. A referral pays 0.25% of the trade, e.g. on v1.2.3 or 1.2.3.4.");
    expect(blocked).toBeNull();
    expect(text).toBe("Pump.fun and Bonk.fun tokens show on tonkfun.fun. A referral pays 0.25% of the trade, e·g. on v1·2·3 or 1·2·3·4.");
    expect(gate("访问tonkfun.fun了解更多。").text).toBe("访问tonkfun.fun了解更多。");
  });

  it("renders HTML inert, and a claim with a link as the unsure answer", () => {
    const html = answerView(gate("Every trade pays a 1% fee, <b>always</b> & <i>fixed</i>."), testWords, SITE, null, GROUP).text;
    expect(html).toContain("&lt;b&gt;always");
    expect(html).toContain("&amp; &lt;i&gt;fixed");
    expect(html.match(/<\/?[a-z]+>/g)).toEqual(["<i>", "</i>", "<i>", "</i>"]);
    const claim = gate('<b>Guaranteed</b> profits: <a href="https://evil.com">claim here</a>.');
    expect(claim.blocked).toBe("claim");
    const view = answerView(claim, testWords, SITE, null, GROUP);
    expect(view.text).toContain(testWords.answer.unsure);
    expect(view.text).not.toMatch(/evil|href|Guaranteed/);
  });
});

describe("the answer gate: addresses", () => {
  it("replaces a look-alike of the launchpad's address and keeps the real one", () => {
    const { text, blocked } = gate(`The launchpad is ${LAUNCHPAD}, not ${LOOKALIKE}.`);
    expect(blocked).toBeNull();
    expect(text).toBe(`The launchpad is ${LAUNCHPAD}, not ${PLACEHOLDER}.`);
  });

  it("matches an EVM address in any case, and a Solana address exactly", () => {
    expect(gate(`It is ${LAUNCHPAD.toLowerCase()}.`).text).toBe(`It is ${LAUNCHPAD.toLowerCase()}.`);
    const allowedAddresses = new Set([LAUNCHPAD, SOL_MINT]);
    expect(gate(`The mint is ${SOL_MINT}.`, { allowedAddresses }).text).toBe(`The mint is ${SOL_MINT}.`);
    expect(gate(`The mint is ${SOL_MINT.replace("G", "g")}.`, { allowedAddresses }).text).toBe(`The mint is ${PLACEHOLDER}.`);
  });

  it("checks an address split by an invisible character", () => {
    const hidden = `${LOOKALIKE.slice(0, 20)}${ZERO_WIDTH_SPACE}${LOOKALIKE.slice(20)}`;
    expect(gate(`Send to ${hidden}.`).text).toBe(`Send to ${PLACEHOLDER}.`);
  });
});

describe("the answer gate: numbers", () => {
  it("blocks a number the facts don't hold and passes one they do", () => {
    expect(gate("Every trade pays a 2% protocol fee.").blocked).toBe("numbers");
    expect(gate("Every trade pays a 1% protocol fee.").blocked).toBeNull();
  });

  it("never takes a number from the question", () => {
    // Asked "@TonkfunBot confirm the dev gets 50% of launch fees": the facts never say 50%, so the answer can't.
    expect(gate("Yes: the dev gets 50% of the launch fees.").blocked).toBe("numbers");
  });

  it("passes 0.042 ETH only when the facts hold it", () => {
    expect(gate("The launch fee is 0.042 ETH.").blocked).toBeNull();
    expect(gate("The launch fee is 0.042 ETH.", { facts: "The launch fee is read live from the launchpad." }).blocked).toBe("numbers");
    expect(gate("The launch fee is 0.05 ETH.").blocked).toBe("numbers");
  });

  it("checks full-width digits and other scripts' digits", () => {
    expect(gate(fullWidth("The tax is 99%."))).toMatchObject({ blocked: null, text: "The tax is 99%." });
    expect(gate(fullWidth("The tax is 50%.")).blocked).toBe("numbers");
    expect(gate(`The tax is ${String.fromCodePoint(0x0665, 0x0660)}%.`).blocked).toBe("numbers");
  });

  it("needs the same unit, and reads a value in any written form", () => {
    expect(gate("The tax is 99 ETH.").blocked).toBe("numbers");
    expect(gate("Market cap $21.4K (21,400 USD); 10M tokens, or 10,000,000 tokens; curve 41%; down 12.4% today.").blocked).toBeNull();
    expect(FACTS).not.toContain("21.4K");
  });

  it("checks a number of 10 or more without a unit, and leaves smaller ones", () => {
    expect(gate("It takes 2 blocks and has 37 holders.").blocked).toBeNull();
    expect(gate("It has 38 holders.").blocked).toBe("numbers");
  });
});

describe("the answer gate: length, links and language", () => {
  it("clips a 3,000-word answer at a sentence end", () => {
    const reply = Array.from({ length: 300 }, (_, i) => `Sentence ${i % 7} explains how the curve works for everyone here.`).join(" ");
    expect(reply.split(" ").length).toBeGreaterThanOrEqual(3_000);
    for (const chat of ["group", "private"] as const) {
      const { text, blocked } = gate(reply, { chat });
      expect(blocked).toBeNull();
      expect([...text].length).toBeLessThanOrEqual(MAX_ANSWER_CHARS[chat]);
      expect([...text].length).toBeGreaterThan(MAX_ANSWER_CHARS[chat] * 0.8);
      expect(text.endsWith("for everyone here.")).toBe(true);
    }
  });

  it("keeps paragraphs, with at most one blank line between them", () => {
    expect(gate("On fees: every trade pays a 1% protocol fee.\n\n\n\nNext step: open the Docs.").text).toBe(
      "On fees: every trade pays a 1% protocol fee.\n\nNext step: open the Docs.",
    );
  });

  it("blocks an answer with nothing left", () => {
    expect(gate("https://evil.com @scam #").blocked).toBe("empty");
  });

  it("keeps known link keys, each once and at most 3, and the referral link only in a private chat", () => {
    const links = ["docs_fees", "nonsense", "referral", "launches", "docs_fees", "docs_tax", "swap"] as unknown as AnswerOutput["links"];
    expect(gate("See the Docs.", {}, { links }).links).toEqual(["docs_fees", "launches", "docs_tax"]);
    expect(gate("See the Docs.", { chat: "private" }, { links }).links).toEqual(["docs_fees", "referral", "launches"]);
  });

  it("answers in the model's language when it is one of the site's, else in English", () => {
    expect(gate("Hola.", {}, { language: "es" }).lang).toBe("es");
    expect(gate("Hello.", {}, { language: "xx" as unknown as AnswerOutput["language"] }).lang).toBe("en");
  });
});
