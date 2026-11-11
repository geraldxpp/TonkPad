// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as app from "@/shared/lib/visible-text";
import * as worker from "../src/text";

/** 👻: one character, two UTF-16 units. */
const GHOST = "\u{1F47B}";

/** Text of every kind the cleaning treats apart, alone and mixed. */
const SAMPLES = [
  "",
  "Ghosty",
  ` $GHOST ${GHOST} `,
  "Gho\u{200B}sty",
  "U\u{200C}S\u{200D}D\u{2060}C\u{FEFF}",
  "\u{202E}YTSOHG",
  "\u{202A}\u{202B}Gho\u{202D}sty\u{202C}\u{2066}\u{2067}\u{2068}x\u{2069}\u{200E}\u{200F}\u{61C}",
  "PEPE\u{E0001}\u{E0041}\u{E0020}\u{E007F}",
  "Gh\u{0}os\u{7}t\u{1B}y\u{7F}\u{80}\u{9B}\u{9F}",
  "Gho\u{AD}sty\u{34F}\u{FE0F}\u{FE00}\u{E0100}\u{E01EF}",
  "\u{3164}\u{115F}\u{1160}\u{FFA0}\u{2800}Ghosty\u{17B4}\u{17B5}\u{180B}\u{180E}\u{180F}",
  "\u{3000} Ghost\t\n\r\v\f\u{85}\u{2028}\u{2029}Coin\u{A0}\u{2003}\u{202F}\u{205F}Two\u{1680} ",
  "Ghost \u{200B} Coin",
  "ドージ Cafe\u{301} Ölü",
  "$ＵЅDС",
  "\u{200B}\u{202E}\u{3164} \u{E0041}\u{0}",
  GHOST.repeat(5),
  "half \u{D83D}",
];

/** "U+202E" */
const codeName = (code: number) => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
/** Each character between two letters, so one dropped or turned into a space shows. */
const between = (codes: readonly number[]) => `a${codes.map((code) => String.fromCodePoint(code)).join("a")}a`;

describe("the worker's copy of the app's text cleaning", () => {
  it("cleans text as the app does", () => {
    for (const sample of SAMPLES) expect(worker.visibleText(sample), JSON.stringify(sample)).toBe(app.visibleText(sample));
  });

  it("treats every character as the app does", () => {
    const differ: string[] = [];
    for (let plane = 0; plane <= 0x10; plane += 1) {
      const codes = Array.from({ length: 0x10000 }, (_, index) => plane * 0x10000 + index);
      if (worker.visibleText(between(codes)) === app.visibleText(between(codes))) continue;
      differ.push(...codes.filter((code) => worker.visibleText(between([code])) !== app.visibleText(between([code]))).map(codeName));
    }
    expect(differ).toEqual([]);
  });

  it("clips text as the app does", () => {
    for (const sample of SAMPLES) {
      for (const max of [0, 1, 2, 3, 6, 16, 48]) expect(worker.clip(sample, max), `${JSON.stringify(sample)} at ${max}`).toBe(app.clip(sample, max));
    }
  });
});
