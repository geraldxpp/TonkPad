import { describe, expect, it } from "vitest";
import { escapeHtml, fill, findAddress, isTokenAddress, plainText, safeText, shortAddr } from "../src/telegram/text";
import { SOL_MINT, WHOA } from "./telegram-fixtures";

describe("chain text for Telegram", () => {
  it("drops what Telegram would turn into a mention, hashtag, cashtag, command or link", () => {
    const shown = plainText("@support_help #win $SCAM /start claim.evil.xyz https://t.me/x me@mail.com", 200);
    for (const live of ["@", "#", "$", "/", ":", "claim.evil", "t.me", "mail.com"]) expect(shown).not.toContain(live);
    expect(shown).toContain("claim·evil·xyz");
  });

  it("leaves no dot a browser could read as a host, whatever surrounds it", () => {
    for (const name of ["tonkfun-claiⓜ.com", "tonkfun™.com", "café.com", "x．com", "a。b"]) expect(plainText(name, 40)).not.toMatch(/[.．。｡](?=\S)/);
    expect(plainText("Dr. Pepe", 40)).toBe("Dr. Pepe");
    expect(plainText("To the moon...", 40)).toBe("To the moon...");
    expect(plainText("evil...com", 40)).toBe("evil···com");
  });

  it("marks a name it had to shorten", () => {
    expect(plainText("A very long token name that goes on and on and on", 20)).toBe("A very long token n…");
  });

  it("keeps an ordinary name readable", () => {
    expect(plainText("Dr. Pepe — the Frog 🐸", 40)).toBe("Dr. Pepe — the Frog 🐸");
  });

  it("removes invisible characters and clips without cutting a character in half", () => {
    expect(plainText("A​pp‮le", 40)).toBe("Apple");
    expect([...plainText("🐸".repeat(50), 10)]).toHaveLength(10);
  });

  it("escapes HTML after cleaning", () => {
    expect(safeText("<b>Rug</b> & co", 40)).toBe("&lt;b&gt;Rug&lt;b&gt; &amp; co");
    expect(escapeHtml("a<b>&c")).toBe("a&lt;b&gt;&amp;c");
  });

  it("fills a template, escaping the template but not the (already safe) values", () => {
    expect(fill("Score {score} & more", { score: "<b>78</b>" })).toBe("Score <b>78</b> &amp; more");
    expect(fill("{missing}", {})).toBe("{missing}");
  });
});

describe("findAddress", () => {
  it("finds an EVM address alone, in a sentence or in a link, lower-cased", () => {
    expect(findAddress(WHOA.toUpperCase().replace("0X", "0x"))).toBe(WHOA);
    expect(findAddress(`check this ${WHOA} please`)).toBe(WHOA);
    expect(findAddress(`https://www.tonkfun.fun/es/token/${WHOA}?tab=1`)).toBe(WHOA);
  });

  it("finds a Solana address and keeps its case", () => {
    expect(findAddress(`look: ${SOL_MINT}`)).toBe(SOL_MINT);
    expect(findAddress(`https://www.tonkfun.fun/token/${SOL_MINT}`)).toBe(SOL_MINT);
  });

  it("finds nothing in ordinary text or a too-long hex string", () => {
    expect(findAddress("hello there")).toBeNull();
    expect(findAddress(`${WHOA}ff`)).toBeNull();
    expect(findAddress("0x1234")).toBeNull();
  });

  it("validates addresses and shortens them", () => {
    expect(isTokenAddress(WHOA)).toBe(true);
    expect(isTokenAddress(SOL_MINT)).toBe(true);
    expect(isTokenAddress("0xnothex")).toBe(false);
    expect(shortAddr(WHOA)).toBe("0xfd42…cd95");
  });
});
