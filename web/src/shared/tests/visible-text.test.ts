import { describe, expect, it } from "vitest";
import { clip, visibleLines, visibleText } from "@/shared/lib/visible-text";

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

  it("drops control characters, C1 controls included", () => {
    expect(visibleText("Gh\u{0}os\u{7}t\u{1B}y\u{7F}")).toBe("Ghosty");
    expect(visibleText("\u{80}Gho\u{9B}sty\u{9F}")).toBe("Ghosty");
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

describe("visibleLines", () => {
  it("keeps every kind of line break, as one \\n each", () => {
    expect(visibleLines("One\nTwo\r\nThree\rFour\u{2028}Five\u{2029}Six\u{85}Seven\vEight\fNine")).toBe("One\nTwo\nThree\nFour\nFive\nSix\nSeven\nEight\nNine");
  });

  it("keeps a blank line between paragraphs", () => {
    expect(visibleLines("Paragraph one.\n\nParagraph two.")).toBe("Paragraph one.\n\nParagraph two.");
  });

  it("cleans each line as visibleText does", () => {
    expect(visibleLines("\u{202E}YTSOHG\u{200B}\n  Gho\u{E0041}st\u{3000}\tCoin  \n\u{0}Two\u{9B}")).toBe("YTSOHG\nGhost Coin\nTwo");
  });

  it("trims blank lines at either end, and leaves nothing of text with nothing visible", () => {
    expect(visibleLines("\n\u{200B}\n Ghosty \n\u{3164}\n")).toBe("Ghosty");
    expect(visibleLines("\u{202E}\n\u{200B}\r\n\u{2800}")).toBe("");
  });
});
