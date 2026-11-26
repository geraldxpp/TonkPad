import type { AllowList } from "../community/types";
import type { TgMessageEntity } from "../types";
import { classifyLink, type FoundLink, isTelegramHost } from "./links-kind";
import { brandLookalike } from "./names-fold";

export { type FoundLink, type LinkKind } from "./links-kind";

/**
 * Links, usernames and contact details in a message, from Telegram's
 * entities (a text_link by its real address) and from the text itself, so a
 * caption, a display name or an edit is read the same way. links-kind.ts
 * says what each link is.
 */

/** Top-level domains a bare "name.tld" in the text is read as a link with (Telegram's own url entities cover the rest). */
const TLDS = new Set(
  ("com net org io xyz app fun co info site online top live link click finance exchange network pro ai dev cc vip club biz ru de fr es nl br uk jp cn kr vn tr pl ca au eu ch gg tv ws ly sh la " +
    "lol wtf money cash games game art bet casino claims digital tech space store shop website world today social capital market markets trade trading one run build codes zone win cloud page " +
    "news global email support help services solutions systems foundation ventures fund investments promo events chat community group team guru ninja rocks tools wiki blog icu cyou sbs cfd " +
    "bond buzz monster rest quest host press agency gold plus life fyi gift gifts bio earth land city center care health credit loan loans").split(" "),
);
/** Top-level domains a "name dot tld" spelling reads as a link with when the name alone doesn't show it, so "the dot com bubble" stays words. */
const DOT_TLDS = new Set("xyz site online top live click app fun io link finance network pro vip club info cc ws lol money cash claims icu cyou sbs cfd bond buzz gift win exchange digital tech space store shop website".split(" "));
/** Launchpads members name in passing ("the fee on Pump.fun"): a name, not a link, when written bare. */
const NAMES = new Set(["pump.fun", "bonk.fun"]);

/** Stands in for a hidden dot while the text is searched again. */
const HIDDEN = "\u2024";
const LABEL = "[\\p{L}\\p{N}][\\p{L}\\p{N}-]*";
const URLISH = new RegExp(
  `(?:https?|hxxps?|tg):\\/\\/[^\\s<>"'\`]+|(?<![\\p{L}\\p{N}@._/${HIDDEN}-])(?:${LABEL}[.${HIDDEN}])+(\\p{L}{2,24})(?![\\p{L}\\p{N}-])(?:[/?#][^\\s<>"'\`]*)?`,
  "giu",
);
const HIDDEN_DOTS = /\s*(?:\[\.\]|\(\.\)|\{\.\}|\[dot\]|\(dot\)|<dot>)\s*/giu;
const HAS_HIDDEN_DOT = /\[\.\]|\(\.\)|\{\.\}|\[dot\]|\(dot\)|<dot>/iu;
/** Starts only at a word's start: without the lookbehind a long run of letters is retried from each one (quadratic). */
const WORD_DOT = /(?<![\p{L}\p{N}-])([\p{L}\p{N}][\p{L}\p{N}-]*)\s+dot\s+(\p{L}{2,24})(?![\p{L}\p{N}])/giu;
const TRAILING = new Set([...".,;:!?)]}'\"»”’"]);
const HANDLE = /(?<![\p{L}\p{N}_@./:])@([a-z][a-z0-9_]{3,31})(?![a-z0-9_])/giu;

/** Without the punctuation that ends a sentence or wraps a link: a loop, since an end-anchored regex retries every run of it. */
function trimEnd(raw: string): string {
  let end = raw.length;
  while (end > 0 && TRAILING.has(raw[end - 1])) end--;
  return raw.slice(0, end);
}

interface Candidate {
  raw: string;
  /** Where it stands in the text; null when found in a rewritten copy. */
  span: [number, number] | null;
  /** Written with a hidden dot ("name[.]tld", "name dot tld") or a defanged scheme (hxxp). */
  hidden: boolean;
}

/** Whether a bare "name.tld" reads as a link: a known top-level domain in lower case (or the whole thing in capitals), and not a launchpad's name. */
function bareLink(raw: string, tld: string): boolean {
  const host = raw.split(/[/?#]/)[0].toLowerCase();
  if (isTelegramHost(host)) return true;
  if (tld !== tld.toLowerCase() && raw !== raw.toUpperCase()) return false;
  return TLDS.has(tld.toLowerCase()) && !(NAMES.has(host) && host === raw.toLowerCase());
}

/** URL-like runs: in the text itself (hidden false), or in its copy with hidden dots made plain, where only those count. */
function scan(text: string, hidden: boolean): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(URLISH)) {
    const raw = trimEnd(m[0]);
    if (hidden ? !raw.includes(HIDDEN) : HAS_HIDDEN_DOT.test(raw)) continue;
    if (!hidden && m[1] !== undefined && !/^www\./i.test(raw) && !bareLink(raw, m[1])) continue;
    const start = m.index ?? 0;
    out.push({ raw: raw.split(HIDDEN).join("."), span: hidden ? null : [start, start + raw.length], hidden: hidden || /^hxxp/i.test(raw) });
  }
  return out;
}

/** The text with its hidden dots marked, so "tonkfun[.]xyz" and "claim dot xyz" are found; null when it has none. */
function unhide(text: string): string | null {
  const marked = text.replace(HIDDEN_DOTS, HIDDEN).replace(WORD_DOT, (match, name: string, tld: string) => {
    const lower = tld.toLowerCase();
    const shows = TLDS.has(lower) && (/[\d-]/.test(name) || DOT_TLDS.has(lower) || brandLookalike(`${name}.${lower}`));
    return shows ? `${name}${HIDDEN}${tld}` : match;
  });
  return marked === text ? null : marked;
}

function entityText(text: string, e: TgMessageEntity): { raw: string; span: [number, number] } | null {
  const { offset, length } = e;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0 || offset + length > text.length) return null;
  return { raw: text.slice(offset, offset + length), span: [offset, offset + length] };
}

function candidates(text: string, entities: readonly TgMessageEntity[]): Candidate[] {
  const out: Candidate[] = [];
  for (const e of entities) {
    const at = entityText(text, e);
    const bareName = at !== null && NAMES.has(at.raw.toLowerCase());
    if (e.type === "url" && at && !bareName) out.push({ raw: at.raw, span: at.span, hidden: /^hxxp/i.test(at.raw) });
    if (e.type === "text_link" && typeof e.url === "string") out.push({ raw: e.url, span: at?.span ?? null, hidden: false });
  }
  out.push(...scan(text, false));
  const marked = unhide(text);
  if (marked !== null) out.push(...scan(marked, true));
  return out;
}

/**
 * Every link in a message, once per key: the url and text_link entities,
 * the text's own links (with a scheme or www., or a bare host with a known
 * top-level domain), hidden spellings ("name dot tld", "name[.]tld",
 * "name(.)tld", hxxp) and `buttons`, the targets of its link buttons
 * (media.ts buttonLinks), each classified, with its keys. A bare Pump.fun or
 * Bonk.fun is a launchpad's name, not a link.
 */
export function findLinks(text: string, entities: readonly TgMessageEntity[], allow: AllowList, buttons: readonly string[] = []): FoundLink[] {
  const found = new Map<string, FoundLink>();
  const targets: Candidate[] = buttons.map((raw) => ({ raw, span: null, hidden: false }));
  for (const c of [...candidates(text, entities), ...targets]) {
    const link = classifyLink(c.raw, c.hidden, allow);
    if (link && !found.has(link.key)) found.set(link.key, link);
  }
  return [...found.values()];
}

/**
 * Where a message's links stand (rules-text.ts reads the words around
 * them): each link written in the text with its span and whether it is risky
 * (neither allowed nor official), and whether a risky one has no span (a
 * hidden-dot spelling, found in a rewritten copy, or a link button).
 */
export function linkSpans(text: string, entities: readonly TgMessageEntity[], allow: AllowList, buttons: readonly string[] = []): { spans: Array<{ span: [number, number]; risky: boolean }>; spanless: boolean } {
  const spans: Array<{ span: [number, number]; risky: boolean }> = [];
  let spanless = false;
  const targets: Candidate[] = buttons.map((raw) => ({ raw, span: null, hidden: false }));
  for (const c of [...candidates(text, entities), ...targets]) {
    const link = classifyLink(c.raw, c.hidden, allow);
    const risky = link !== null && link.kind !== "allowed" && link.kind !== "official_telegram";
    if (c.span) spans.push({ span: c.span, risky });
    else if (risky) spanless = true;
  }
  return { spans, spanless };
}

/** Usernames mentioned with @ (lower case, without the @), from mention entities and the text; e-mail addresses and paths hold none. */
export function findHandles(text: string, entities: readonly TgMessageEntity[]): string[] {
  const out = new Set<string>();
  for (const e of entities) {
    const at = e.type === "mention" ? entityText(text, e) : null;
    if (at && /^@[a-z][a-z0-9_]{3,31}$/i.test(at.raw)) out.add(at.raw.slice(1).toLowerCase());
  }
  for (const m of text.matchAll(HANDLE)) out.add(m[1].toLowerCase());
  return [...out];
}

/** How many phone numbers and e-mail addresses Telegram marked. */
export function findContacts(entities: readonly TgMessageEntity[]): { phones: number; emails: number } {
  return { phones: entities.filter((e) => e.type === "phone_number").length, emails: entities.filter((e) => e.type === "email").length };
}

/** Whether a message opens with a bot command (/check, /check@SomeBot): what follows it is meant for a bot. */
export const opensWithCommand = (text: string): boolean => /^\/[a-z0-9_]{1,32}(?:@[a-z0-9_]{3,32})?(?=\s|$)/iu.test(text);

/** The text with every link blanked out (same length), so what is left holds only bare addresses and words. */
export function stripLinks(text: string, entities: readonly TgMessageEntity[]): string {
  const chars = text.split("");
  for (const { span } of candidates(text, entities)) {
    if (span) for (let i = span[0]; i < span[1] && i < chars.length; i++) chars[i] = " ";
  }
  return chars.join("");
}
