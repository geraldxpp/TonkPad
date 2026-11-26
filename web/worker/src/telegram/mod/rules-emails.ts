import type { TgMessageEntity } from "../types";
import { brandLookalike, teamAddress } from "./names-fold";
import { EMAIL } from "./secrets-contacts";
import { ATTRIBUTION, matchesAny } from "./words";

/**
 * E-mail addresses in a message, as the scam rules read them
 * (prompts/15-community-agent.md, "DM me" and fake support): an address at
 * a look-alike domain ("support@tonkfun-help.io") is a look-alike link, and
 * asking members to write to an address for help ("contact
 * sam@cryptofixer.io for help") is fake support, never certain. The team's
 * own addresses (the Security contact) are neither.
 */
export interface Emails {
  /** Where the look-alike addresses stand, as spans of the text. */
  lookalike: Array<[number, number]>;
  /** An address members are asked to write to for help or support. */
  support: boolean;
  /** Where the first such address starts, or null. */
  supportAt: number | null;
}

/** At most this many addresses are read per message. */
const MAX = 16;
/** Asking to write to the address, just before it. */
const CONTACT = /(?<![\p{L}\p{N}_])(?:contact|e-?mail|mail|write (?:to )?|reach(?: out)?(?: to)?|message|send (?:\S+ ){0,3}to|escr[ií]b(?:e|ele|enos)(?: a)?|contacta|contate|envie (?:para|um e-?mail para)|[ée]cri(?:s|vez)(?: [àa])?|contactez|schreib(?:e|t)?(?: an)?|kontaktiere|напиши(?:те)?(?: на)?|пиши(?:те)?(?: на)?|hubungi|kirim (?:email|e-mail) ke|liên hệ|gửi (?:email|thư) (?:đến|tới))\s*:?\s*$/iu;
/** What the address is offered for, just after it. */
const FOR_HELP = /^\s*(?:for|about|regarding|para|pour|f[üu]r|за|untuk|để)?\s*(?:help|support|assistance|ayuda|soporte|ajuda|suporte|aide|hilfe|unterst[üu]tzung|помощ\p{L}*|поддержк\p{L}*|bantuan|hỗ trợ|recover\p{L}*|refunds?|fix\p{L}*)(?![\p{L}\p{N}_])/iu;

/** Every address with its span: Telegram's marks, then any address-shaped run. */
function addresses(text: string, entities: readonly TgMessageEntity[]): Array<{ address: string; span: [number, number] }> {
  const out: Array<{ address: string; span: [number, number] }> = [];
  for (const { type, offset, length } of entities) {
    if (type !== "email" || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0 || offset + length > text.length) continue;
    out.push({ address: text.slice(offset, offset + length), span: [offset, offset + length] });
  }
  for (const m of text.matchAll(EMAIL)) {
    const start = m.index ?? 0;
    if (out.length >= MAX) break;
    if (!out.some((a) => a.span[0] <= start && start < a.span[1])) out.push({ address: m[0], span: [start, start + m[0].length] });
  }
  return out.slice(0, MAX);
}

export function readEmails(text: string, entities: readonly TgMessageEntity[]): Emails {
  const result: Emails = { lookalike: [], support: false, supportAt: null };
  for (const { address, span } of addresses(text, entities)) {
    if (teamAddress(address)) continue;
    const at = address.lastIndexOf("@");
    if (at > 0 && brandLookalike(address.slice(at + 1))) result.lookalike.push(span);
    if (CONTACT.test(text.slice(Math.max(0, span[0] - 40), span[0])) && FOR_HELP.test(text.slice(span[1], span[1] + 40)) && !result.support) {
      result.support = true;
      result.supportAt = span[0];
    }
  }
  return result;
}

/** Someone else's words before the address ("someone told me to email …", "fake support asks you to email …"). */
const TOLD = /(?<![\p{L}\p{N}_])(?:asks?|asking|asked|tells?|telling|told|wants?|wanted)\s+(?:you|me|us|people|everyone|members|them)\s+to(?![\p{L}\p{N}_])/iu;

/**
 * The offer to write to an address for help is someone else's when the
 * message reports or asks about a scam and the offer is attributed to
 * another (prompts/15-community-agent.md, fake support: a victim's report
 * is never the author's own offer).
 */
export function emailOfferOf(emails: Emails, text: string, reportWords: boolean): boolean {
  if (!emails.support || emails.supportAt === null) return false;
  if (!reportWords) return true;
  const before = text.slice(Math.max(0, emails.supportAt - 120), emails.supportAt);
  return !(matchesAny(ATTRIBUTION, before) || TOLD.test(before));
}
