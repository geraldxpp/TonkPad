// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanName, cleanSymbol, shortAddress, type TrackedToken } from "../src/model";
import { PonsBook } from "../src/pons/book";
import type { AssetInfo } from "../src/sources/helius";
import { parsePumpPortal } from "../src/sources/pumpportal";
import { TokenStore } from "../src/store";
import { clip, visibleText } from "../src/text";
import { toToken } from "../src/tokens";
import { NOW, tracked } from "./fixtures";

/** 👻: one character, two UTF-16 units. */
const GHOST = "\u{1F47B}";

describe("visibleText", () => {
  it("drops zero-width characters", () => {
    expect(visibleText("Gho\u{200B}sty")).toBe("Ghosty");
    expect(visibleText("U\u{200C}S\u{200D}D\u{2060}C\u{FEFF}")).toBe("USDC");
  });

  it("drops direction overrides, embeddings, isolates and marks, so text shows in its real order", () => {
    // U+202E would draw "YTSOHG" right to left, as "GHOSTY".
    expect(visibleText("\u{202E}YTSOHG")).toBe("YTSOHG");
    expect(visibleText("\u{202A}\u{202B}Gho\u{202D}sty\u{202C}")).toBe("Ghosty");
    expect(visibleText("\u{2066}\u{2067}\u{2068}Ghosty\u{2069}\u{200E}\u{200F}\u{61C}")).toBe("Ghosty");
  });

  it("drops tag characters", () => {
    expect(visibleText("PEPE\u{E0001}\u{E0041}\u{E0020}\u{E007F}")).toBe("PEPE");
  });

  it("drops control characters", () => {
    expect(visibleText("Gh\u{0}os\u{7}t\u{1B}y\u{7F}\u{9B}")).toBe("Ghosty");
  });

  it("drops soft hyphens, the grapheme joiner, variation selectors and blank letters", () => {
    expect(visibleText("Gho\u{AD}sty\u{34F}\u{FE0F}\u{FE00}\u{E0100}\u{E01EF}")).toBe("Ghosty");
    expect(visibleText("\u{3164}\u{115F}\u{1160}\u{FFA0}\u{2800}Ghosty\u{17B4}\u{17B5}\u{180B}\u{180E}\u{180F}")).toBe("Ghosty");
  });

  it("shows tabs, line breaks and wide spaces as one plain space, trimmed", () => {
    expect(visibleText("\u{3000} Ghost\t\n\r\v\f\u{85}\u{2028}\u{2029}Coin\u{A0}\u{2003}\u{202F}\u{205F}Two\u{1680} ")).toBe("Ghost Coin Two");
  });

  it("collapses the spaces left around a dropped character", () => {
    expect(visibleText("Ghost \u{200B} Coin")).toBe("Ghost Coin");
  });

  it("keeps ordinary text, other scripts, accents and emoji", () => {
    expect(visibleText(`Ghosty ${GHOST}`)).toBe(`Ghosty ${GHOST}`);
    expect(visibleText("ドージ")).toBe("ドージ");
    expect(visibleText("Cafe\u{301} Ölü")).toBe("Cafe\u{301} Ölü");
  });

  it("leaves nothing of text with nothing visible", () => {
    expect(visibleText("\u{200B}\u{202E}\u{3164} \u{E0041}\u{0}")).toBe("");
  });
});

describe("clip", () => {
  it("counts characters, never cutting an emoji in half", () => {
    expect(clip(`ab${GHOST}cd`, 3)).toBe(`ab${GHOST}`);
    expect(clip(GHOST.repeat(3), 2)).toBe(GHOST.repeat(2));
    expect(clip("ab", 5)).toBe("ab");
  });
});

describe("cleanName and cleanSymbol", () => {
  it("drop what visibleText drops", () => {
    expect(cleanName("\u{202E}YTSOHG\u{200B}")).toBe("YTSOHG");
    expect(cleanName(" Ghost\u{3000}\u{2028}Coin ")).toBe("Ghost Coin");
    expect(cleanSymbol("U\u{200B}SD\u{E0041}C\u{0}")).toBe("USDC");
  });

  it("take a ticker's $ off even behind an invisible character", () => {
    expect(cleanSymbol(" $GHOST ")).toBe("GHOST");
    expect(cleanSymbol("\u{200B}$GHOST")).toBe("GHOST");
    expect(cleanSymbol("\u{202E}$\u{A0}TSOHG")).toBe("TSOHG");
  });

  it("clip names at 48 characters and tickers at 16, never splitting an emoji", () => {
    // Clipping by UTF-16 units used to leave half of the ghost.
    expect(cleanName("x".repeat(47) + GHOST + "y")).toBe("x".repeat(47) + GHOST);
    expect(cleanName(GHOST.repeat(60))).toBe(GHOST.repeat(48));
    expect(cleanSymbol("Y".repeat(15) + GHOST + "Z")).toBe("Y".repeat(15) + GHOST);
    expect(cleanSymbol("$" + "Y".repeat(30))).toBe("Y".repeat(16));
  });

  it("clip after cleaning, so invisible characters don't use up the length", () => {
    expect(cleanName("\u{200B}".repeat(100) + "Ghosty")).toBe("Ghosty");
  });

  it("leave nothing when nothing shows", () => {
    expect(cleanName("\u{200B}\u{2800} \u{202E}")).toBe("");
    expect(cleanSymbol("$\u{200B}")).toBe("");
  });
});

describe("a name or ticker with nothing visible", () => {
  const blank = "\u{200B}\u{202E}\u{3164}";
  const asset = (name: string | null, symbol: string | null): AssetInfo => ({
    image: null,
    name,
    symbol,
    mintRevoked: true,
    freezeRevoked: true,
    mintAuthority: null,
    freezeAuthority: null,
    supply: null,
  });

  it("shows like a missing one", () => {
    const launch = parsePumpPortal({ txType: "create", mint: "MintA", pool: "pump", name: blank, symbol: `$${blank}`, traderPublicKey: "Dev" }, NOW);
    expect(launch).toMatchObject({ name: "", symbol: "" });
    const token = tracked({ name: "", symbol: "" });
    expect(toToken(token, NOW)).toMatchObject({ ticker: "???", name: shortAddress(token.address) });
    expect(toToken({ ...token, symbol: "GHOST" }, NOW)).toMatchObject({ ticker: "GHOST", name: "GHOST" });
  });

  it("is filled in from Helius's metadata, cleaned, as a missing one is", () => {
    const store = new TokenStore();
    const token = tracked({ name: cleanName(blank), symbol: cleanSymbol(blank) });
    store.add(token);
    store.applyAsset(token.address, asset("\u{202E}YTSOHG", "GH\u{200B}OST"), NOW);
    expect(store.get(token.address)).toMatchObject({ name: "YTSOHG", symbol: "GHOST" });
  });

  it("doesn't replace a Pons token's name or ticker", () => {
    const store = new TokenStore();
    const book = new PonsBook(store);
    const token = tracked({ chain: "rh", launchpad: "pons", name: "", symbol: "" });
    store.add(token);
    book.meta(token.address, { name: "\u{202E}YTSOHG", symbol: "$\u{200B}GHOST", logo: null });
    expect(store.get(token.address)).toMatchObject({ name: "YTSOHG", symbol: "GHOST" });
    book.meta(token.address, { name: blank, symbol: blank, logo: null });
    expect(store.get(token.address)).toMatchObject({ name: "YTSOHG", symbol: "GHOST" });
  });
});

describe("restoring a snapshot", () => {
  it("cleans names and tickers saved before invisible characters were dropped", () => {
    const store = new TokenStore();
    const old = tracked({ name: "\u{202E}YTSOHG\u{2066}", symbol: "\u{200B}GHOST\u{E0041}" });
    store.restore(JSON.parse(JSON.stringify([old])) as TrackedToken[], NOW);
    expect(store.get(old.address)).toMatchObject({ name: "YTSOHG", symbol: "GHOST" });
  });

  it("doesn't take a ticker's $ a second time, and keeps clean text as it was", () => {
    const store = new TokenStore();
    // Cleaned from "$$X" when it launched.
    const dollar = tracked({ name: `Ghosty ${GHOST}`, symbol: "$X" });
    store.restore([dollar], NOW);
    expect(store.get(dollar.address)).toMatchObject({ name: `Ghosty ${GHOST}`, symbol: "$X" });
  });

  it("copes with a token saved without a name or ticker", () => {
    const store = new TokenStore();
    const token = tracked();
    const bare: Partial<TrackedToken> = { ...token };
    delete bare.name;
    delete bare.symbol;
    store.restore([bare as TrackedToken], NOW);
    expect(store.get(token.address)).toMatchObject({ name: "", symbol: "" });
  });
});
