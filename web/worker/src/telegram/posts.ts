import { htmlLang, type Locale, plural } from "@/shared/i18n/config";
import type { MissionLockJson } from "@/shared/tonk/mission";
import type { Token } from "@/shared/types/token";
import { words } from "./i18n";
import { tokenUrl } from "./links";
import { escapeHtml as esc, fill } from "./text";
import type { View } from "./types";
import { nameLine, scoreLine } from "./views";

/**
 * The official channel's posts: a title in bold, the token, one or two plain
 * facts, and one button to the token on tonkfun.fun. Nothing urges anyone to
 * buy, and no wallet is ever named.
 */

const DAY = 86_400;
/** The last second of the year 9999: a lock "ending" later is no date anyone can show (the contract sets no maximum). */
export const LAST_DATE = 253_402_300_799;

const open = (token: Token, lang: Locale, site: string) => ({
  inline_keyboard: [[{ text: words(lang).card.open, url: tokenUrl(site, lang, token.address) }]],
});

const post = (title: string, token: Token, lines: string[], lang: Locale, site: string): View => ({
  text: [`<b>${esc(title)}</b>`, nameLine(token), "", ...lines].join("\n").trimEnd(),
  keyboard: open(token, lang, site),
});

/** A share inside a sentence, placed as the language writes it (as the site's own sentences do): "100%", "100 %" (fr, de), "%100" (tr). */
export function pctText(bps: number, lang: Locale): string {
  const n = Number((bps / 100).toFixed(2));
  if (lang === "tr") return `%${n}`;
  if (lang === "fr" || lang === "de") return `${n}\u00a0%`;
  return `${n}%`;
}

/** "100% of the dev buy locked for 180 days" (or vests over), or null without a real lock. */
export function lockLine(lock: MissionLockJson | null, lang: Locale): string | null {
  if (!lock || lock.end <= lock.start || lock.end > LAST_DATE) return null;
  const d = words(lang).channel;
  const days = plural(lang, d.days, Math.max(1, Math.round((lock.end - lock.start) / DAY)));
  return fill(lock.type === "linear" ? d.vest : d.lock, { pct: pctText(lock.lockedBps, lang), days: esc(days) });
}

export function launchPost(token: Token, facts: { lock: MissionLockJson | null; crewBps: number }, lang: Locale, site: string): View {
  const d = words(lang).channel;
  const lines = [scoreLine(token, lang)];
  const lock = lockLine(facts.lock, lang);
  if (lock) lines.push(lock);
  if (facts.crewBps >= 100) lines.push(fill(d.crew, { pct: pctText(facts.crewBps, lang) }));
  lines.push(esc(d.shieldOn), "", `<code>${esc(token.address)}</code>`);
  return post(d.launch, token, lines, lang, site);
}

export function milestonePost(token: Token, step: 50 | 90, lang: Locale, site: string): View {
  const d = words(lang).channel;
  return post(step === 50 ? d.half : d.almost, token, [fill(d.sold, { pct: `<b>${pctText(step * 100, lang)}</b>` })], lang, site);
}

export function graduationPost(token: Token, lang: Locale, site: string): View {
  const d = words(lang).channel;
  return post(d.graduated, token, [esc(d.graduatedBody)], lang, site);
}

/** A lock's end date in the channel's language, e.g. "19 May 2027"; French and Portuguese write the 1st as an ordinal. */
export function lockDate(end: number, lang: Locale): string {
  const text = new Intl.DateTimeFormat(htmlLang(lang), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(end * 1000));
  if (lang === "fr") return text.replace(/^1 /, "1er ");
  if (lang === "pt") return text.replace(/^1 de /, "1º de ");
  return text;
}

/** A lock extended to `end` (unix seconds), or null for an end no date can show. */
export function lockPost(token: Token, end: number, lang: Locale, site: string): View | null {
  if (!(end > 0 && end <= LAST_DATE)) return null;
  const d = words(lang).channel;
  return post(d.lockExtended, token, [fill(d.lockUntil, { date: esc(lockDate(end, lang)) })], lang, site);
}

/** ETH as the channel shows it: en-US digits, at most 4 decimals, and two significant ones below 0.0001 (never a bare 0). */
export const ethText = (eth: number) =>
  new Intl.NumberFormat("en-US", eth > 0 && eth < 0.0001 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: eth < 1 ? 4 : 2 }).format(eth);

export function shieldPost(token: Token, taxed: { buys: number; eth: number }, lang: Locale, site: string): View {
  const d = words(lang).channel;
  const buys = plural(lang, d.buys, taxed.buys, String(taxed.buys));
  return post(d.shield, token, [fill(d.shieldBody, { buys: `<b>${esc(buys)}</b>`, eth: `<b>${ethText(taxed.eth)}</b>` })], lang, site);
}
