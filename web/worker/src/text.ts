/**
 * Text a token says about itself (launch feeds, Helius metadata, token
 * contracts) as the app shows it. The same cleaning as `visibleText` and
 * `clip` in the app's `shared/lib/visible-text.ts`, kept here so that a change
 * to it redeploys the worker (Railway watches `web/worker/` only): change both
 * together. `tests/text-parity.test.ts` holds the two equal.
 */

/** Spaces of any width and line breaks, each shown as one plain space. */
const BREAKS = /[\t\n\v\f\r\u{85}\u{2028}\u{2029}\p{Zs}]/gu;
/**
 * Characters that draw nothing or turn text around: controls, zero-width and
 * direction marks, tag characters, the soft hyphen, variation selectors and
 * blank letters (Hangul fillers, the blank Braille cell).
 */
const INVISIBLE = /[\p{Cc}\p{Cf}\u{34F}\u{115F}\u{1160}\u{17B4}\u{17B5}\u{180B}-\u{180F}\u{2800}\u{3164}\u{FE00}-\u{FE0F}\u{FFA0}\u{E0100}-\u{E01EF}]/gu;

/** Invisible characters dropped, spaces collapsed, trimmed. */
export function visibleText(raw: string): string {
  return raw.replace(BREAKS, " ").replace(INVISIBLE, "").replace(/ {2,}/g, " ").trim();
}

/** At most `max` characters, never cutting one in half. */
export const clip = (text: string, max: number) => [...text].slice(0, max).join("");
