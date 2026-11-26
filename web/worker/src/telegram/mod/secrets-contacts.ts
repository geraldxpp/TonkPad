import type { TgMessageEntity } from "../types";
import { maskLocalPhones } from "./secrets-contacts-phones";

/**
 * E-mail addresses and phone numbers in text that may go to Claude
 * (secrets.ts maskForModel): what Telegram marked, when the caller passes
 * its entities, and what conservative patterns find in any text
 * (secrets-contacts-phones.ts has the local formats). A pattern would rather
 * miss an odd local number than hide an amount, a date or an address.
 */

/** An address: a local part, "@", then labels ending in a top-level domain of letters; each run is read from its start only. */
export const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){0,6}\.\p{L}{2,24}(?![\p{L}\p{N}-])/gu;
/** "+" and digits with spaces, hyphens or brackets between them (no dots or commas: those are amounts). */
const INTERNATIONAL = /(?<![\p{L}\p{N}+])\+\d[\d ()\u00A0-]{5,24}\d(?![\p{L}\p{N}])/gu;
/** North American: (555) 123-4567, 555-123-4567, 555.123.4567, 555 123 4567. */
const NANP = /(?<![\p{L}\p{N}+.,-])(?:\(\d{3}\) ?|\d{3}[ .-])\d{3}[ .-]\d{4}(?![\p{L}\p{N}]|[.,-]\d)/gu;
/** A local number after a trunk 0, in three or four groups: 0812-3456-7890, 0912 345 678. */
const TRUNK = /(?<![\p{L}\p{N}+.,-])0\d{2,4}(?:[ .-]\d{2,4}){2,3}(?![\p{L}\p{N}]|[.,-]\d)/gu;

const digits = (text: string) => text.replace(/\D/g, "").length;

/** Telegram's own marks, as spans of `text`; anything that doesn't fit the text is ignored. */
function spans(text: string, entities: readonly TgMessageEntity[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const e of Array.isArray(entities) ? entities : []) {
    if (e?.type !== "email" && e?.type !== "phone_number") continue;
    const { offset, length } = e;
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0 || offset + length > text.length) continue;
    out.push([offset, offset + length]);
  }
  return out.sort((a, b) => b[0] - a[0]);
}

/** The text with what Telegram marked as an e-mail address or a phone number replaced by `mask` (from the end, so earlier offsets hold). */
export function maskMarked(text: string, entities: readonly TgMessageEntity[], mask: string): string {
  let out = text;
  let until = Number.POSITIVE_INFINITY;
  for (const [start, end] of spans(text, entities)) {
    if (end > until) continue;
    out = `${out.slice(0, start)}${mask}${out.slice(end)}`;
    until = start;
  }
  return out;
}

/** Invisible characters, which could split a number so no pattern sees it ("0812\u200B34567890"). */
const INVISIBLE = /[\p{Cf}\u{34F}\u{115F}\u{1160}\u{17B4}\u{17B5}\u{180B}-\u{180F}\u{3164}\u{FE00}-\u{FE0F}\u{FFA0}]/gu;

/** The text with every e-mail address and phone number the patterns find replaced by `mask`, invisible characters dropped first. */
export function maskContacts(text: string, mask: string): string {
  const phone = (min: number) => (run: string) => {
    const n = digits(run);
    return n >= min && n <= 15 ? mask : run;
  };
  const plain = text.replace(INVISIBLE, "");
  const masked = plain
    .replace(EMAIL, mask)
    .replace(INTERNATIONAL, (run) => {
      const n = digits(run);
      // Without a separator, a short run is more likely an amount ("+100000000").
      return n >= 8 && n <= 15 && (n >= 10 || /[ ()\u00A0-]/u.test(run)) ? mask : run;
    })
    .replace(NANP, mask)
    .replace(TRUNK, phone(10));
  return maskLocalPhones(masked, mask);
}
