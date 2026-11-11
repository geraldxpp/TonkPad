/**
 * Text a token says about itself, as the app shows it. Anyone can publish a
 * token, so its name, ticker and stored texts may carry characters that draw
 * nothing or turn the text around, to pass for another token.
 *
 * The worker keeps a copy of `visibleText` and `clip` in
 * `web/worker/src/text.ts`, because Railway redeploys it only when
 * `web/worker/` changes: change both together. A worker test holds them equal.
 */

/** Spaces of any width and line breaks, each shown as one plain space. */
const BREAKS = /[\t\n\v\f\r\u{85}\u{2028}\u{2029}\p{Zs}]/gu;
/**
 * Characters that draw nothing or turn text around: controls, zero-width and
 * direction marks, tag characters, the soft hyphen, variation selectors and
 * blank letters (Hangul fillers, the blank Braille cell).
 */
const INVISIBLE = /[\p{Cc}\p{Cf}\u{34F}\u{115F}\u{1160}\u{17B4}\u{17B5}\u{180B}-\u{180F}\u{2800}\u{3164}\u{FE00}-\u{FE0F}\u{FFA0}\u{E0100}-\u{E01EF}]/gu;

/** A token's text as it is shown: invisible characters dropped, spaces collapsed, trimmed. */
export function visibleText(raw: string): string {
  return raw.replace(BREAKS, " ").replace(INVISIBLE, "").replace(/ {2,}/g, " ").trim();
}

/** At most `max` characters, never cutting one in half. */
export const clip = (text: string, max: number) => [...text].slice(0, max).join("");

/** A line break of any kind: CR LF, LF, CR, the vertical tab, form feed, NEL, and the line and paragraph separators. */
const LINE_BREAK = /\r\n|[\n\v\f\r\u{85}\u{2028}\u{2029}]/u;

/**
 * Text shown over several lines, such as a description: each line cleaned as
 * `visibleText` cleans one, every kind of line break kept as "\n", trimmed.
 */
export function visibleLines(raw: string): string {
  return raw.split(LINE_BREAK).map(visibleText).join("\n").trim();
}
