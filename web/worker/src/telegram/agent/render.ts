import { fmt, type Locale, localizePath } from "@/shared/i18n/config";
import { DEFAULT_HELPLINE_URL } from "../community/config";
import type { CommunityDictionary, LinkWord } from "../community/words";
import { tokenUrl } from "../links";
import { escapeHtml as esc, isTokenAddress } from "../text";
import type { Button, View } from "../types";
import type { Gated } from "./gate";
import type { LinkKey, ToolToken } from "./types";

/**
 * An answer as Telegram shows it (prompts/15-community-agent.md, How it
 * talks): the italic "AI answer" label first, the gated text, then the lines
 * code writes (the score line, the DM warning, a note on what happens next).
 * Answers carry no footer since 26 Nov 2026 (the owner's call); the label
 * still marks each one. A fixed reply in place of an answer carries the DM
 * warning too when the question called for it. Every word of the model's is escaped. Links are
 * buttons only: the site's pages (in the asker's language in a private chat,
 * unprefixed where many read them, as cardView does), the bot's own
 * /launches list, and in a private chat the referral start link and the
 * token's page.
 */

export type FallbackKind = "unsure" | "refused" | "busy" | "paused" | "tooLong" | "textOnly" | "cooldown";

export interface AnswerViewOptions {
  /** In a group: links unprefixed, and no token, referral or Share button. */
  shared: boolean;
  lang: Locale;
  /** From scoreLine(): plain text, escaped here. */
  scoreLine: string | null;
  /** The address the asker sent, for its token button (private chats only). */
  tokenButton: string | null;
  dmWarning: boolean;
  extra: "escalated" | "shareAsk" | "flaw" | "business" | null;
  /** What the Share button carries (s:<shareData>), private chats only. */
  shareData: string | null;
}

/** The site's pages an answer links to; the Docs anchors are DOC_SECTIONS (agent-render.test.ts holds them equal). */
export const LINK_PATHS: Record<Exclude<LinkKey, "launches" | "referral">, string> = Object.freeze({
  docs: "/docs",
  docs_about: "/docs#about",
  docs_launching: "/docs#launching",
  docs_curve: "/docs#curve",
  docs_fees: "/docs#fees",
  docs_locks: "/docs#locks",
  docs_crew: "/docs#crew",
  docs_tax: "/docs#tax",
  docs_score: "/docs#score",
  docs_safety: "/docs#safety",
  docs_faq: "/docs#faq",
  launch: "/launch",
  explore: "/",
  swap: "/swap",
  bridge: "/bridge",
  portfolio: "/portfolio",
  security: "/security",
  privacy: "/privacy/telegram",
});

type PageKey = keyof typeof LINK_PATHS;

/** Each page's button label: every Docs section is labelled Docs. */
const PAGE_WORDS: Record<PageKey, LinkWord> = {
  docs: "docs", docs_about: "docs", docs_launching: "docs", docs_curve: "docs", docs_fees: "docs", docs_locks: "docs",
  docs_crew: "docs", docs_tax: "docs", docs_score: "docs", docs_safety: "docs", docs_faq: "docs",
  launch: "launch", explore: "explore", swap: "swap", bridge: "bridge", portfolio: "portfolio", security: "security", privacy: "privacy",
};

const TELEGRAM_MAX = 4_096;
const CALLBACK_MAX = 64;
const PER_ROW = 2;
/** A bot's username, as t.me/<bot> may hold it. */
const BOT_NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const SHARE_DATA = /^[A-Za-z0-9_:.-]+$/;
/** The fallbacks that stand in for an answer, framed like one; and those that offer the Docs. */
const FRAMED: ReadonlySet<FallbackKind> = new Set<FallbackKind>(["unsure", "refused"]);
const WITH_DOCS: ReadonlySet<FallbackKind> = new Set<FallbackKind>(["unsure", "refused", "paused"]);

/** `text` escaped, cut with "…" so that its escaped form fits `room` characters. */
function escapedWithin(text: string, room: number): string {
  const whole = esc(text);
  if (whole.length <= room) return whole;
  let out = "";
  for (const char of text) {
    const next = out + esc(char);
    if (next.length + 1 > room) break;
    out = next;
  }
  return `${out}…`;
}

/** The answer's frame around `body` (plain text) and `notes` (safe HTML), within Telegram's 4,096 characters. */
function framed(words: CommunityDictionary, body: string, notes: readonly string[]): string {
  const head = `<i>${esc(words.answer.label)}</i>\n`;
  const tail = notes.length > 0 ? `\n\n${notes.join("\n")}` : "";
  const text = `${head}${escapedWithin(body, TELEGRAM_MAX - head.length - tail.length)}${tail}`;
  // Only words far past any real dictionary's could still overflow: then the plain "not sure" line.
  return text.length <= TELEGRAM_MAX ? text : escapedWithin(words.answer.unsure, TELEGRAM_MAX);
}

const pageButton = (key: PageKey, words: CommunityDictionary, site: string, lang: Locale): Button => ({
  text: words.links[PAGE_WORDS[key]],
  url: `${site}${localizePath(lang, LINK_PATHS[key])}`,
});

function linkButton(key: LinkKey, words: CommunityDictionary, site: string, lang: Locale, bot: string | null): Button | null {
  if (key === "launches") return { text: words.links.launches, callback_data: "l:tonk" };
  if (key === "referral") return bot !== null && BOT_NAME.test(bot) ? { text: words.links.referral, url: `https://t.me/${bot}?start=ref` } : null;
  return Object.hasOwn(LINK_PATHS, key) ? pageButton(key, words, site, lang) : null;
}

/** The token's address for its button: a validated token address, EVM lower-cased. */
function tokenAddress(raw: string | null): string | null {
  if (!raw) return null;
  const address = /^0x/i.test(raw) ? raw.toLowerCase() : raw;
  return isTokenAddress(address) ? address : null;
}

function shareButton(words: CommunityDictionary, data: string | null): Button | null {
  const callback = `s:${data ?? ""}`;
  return data && SHARE_DATA.test(data) && callback.length <= CALLBACK_MAX ? { text: words.answer.shareButton, callback_data: callback } : null;
}

function answerButtons(links: readonly LinkKey[], words: CommunityDictionary, site: string, bot: string | null, o: AnswerViewOptions): Button[][] {
  const lang: Locale = o.shared ? "en" : o.lang;
  const token = o.shared ? null : tokenAddress(o.tokenButton);
  const buttons: Button[] = token ? [{ text: words.links.token, url: tokenUrl(site, lang, token) }] : [];
  for (const key of links) {
    const button = linkButton(key, words, site, lang, o.shared ? null : bot);
    if (button) buttons.push(button);
  }
  if (o.extra === "flaw" || o.extra === "business") buttons.push(pageButton("security", words, site, lang));
  // One button per label (two Docs sections would read as the same button twice), and none without one: Telegram would refuse the message.
  const labels = new Set<string>();
  const unique = buttons.filter((b) => {
    if (b.text.trim() === "" || labels.has(b.text)) return false;
    labels.add(b.text);
    return true;
  });
  const rows: Button[][] = [];
  for (let i = 0; i < unique.length; i += PER_ROW) rows.push(unique.slice(i, i + PER_ROW));
  const share = o.shared ? null : shareButton(words, o.shareData);
  return share ? [...rows, [share]] : rows;
}

const withRows = (text: string, rows: Button[][]): View => (rows.length > 0 ? { text, keyboard: { inline_keyboard: rows } } : { text });

/** A gated answer, or the "not sure" answer when the gate blocked it (with the DM warning when the options ask for it). */
export function answerView(g: Gated, words: CommunityDictionary, site: string, bot: string | null, options: AnswerViewOptions): View {
  if (g.blocked !== null || g.text.trim() === "") return fallbackView("unsure", words, site, options);
  const notes = [options.scoreLine, options.dmWarning ? words.safety.dmWarning : null, options.extra ? words.answer[options.extra] : null];
  const lines = notes.filter((line): line is string => typeof line === "string" && line.trim() !== "").map(esc);
  return withRows(framed(words, g.text, lines), answerButtons(g.links, words, site, bot, options));
}

/** A fixed reply in place of an answer: "not sure" and a refusal framed like one; those and "paused" with a Docs button; any with the DM warning after it. */
export function fallbackView(kind: FallbackKind, words: CommunityDictionary, site: string, options: { shared: boolean; lang: Locale; dmWarning?: boolean }): View {
  const line = words.answer[kind];
  const warning = options.dmWarning === true && words.safety.dmWarning.trim() !== "" ? words.safety.dmWarning : null;
  const text = FRAMED.has(kind)
    ? framed(words, line, warning ? [esc(warning)] : [])
    : escapedWithin(warning ? `${line}\n\n${warning}` : line, TELEGRAM_MAX);
  return withRows(text, WITH_DOCS.has(kind) ? [[pageButton("docs", words, site, options.shared ? "en" : options.lang)]] : []);
}

/** The fixed DM-scam warning alone, for an asker whose note was already sent. */
export const dmWarningView = (words: CommunityDictionary): View => ({ text: escapedWithin(words.safety.dmWarning, TELEGRAM_MAX) });

/** An https helpline address, else the default directory. */
function helpline(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) return parsed.href;
  } catch {
    // Not a URL: the default below.
  }
  return DEFAULT_HELPLINE_URL;
}

/** The fixed, human-written reply to someone at risk, with one button to a helpline directory: no number, never the Docs. */
export function crisisView(words: CommunityDictionary, helplineUrl: string): View {
  return { text: escapedWithin(words.crisis.body, TELEGRAM_MAX), keyboard: { inline_keyboard: [[{ text: words.crisis.button, url: helpline(helplineUrl) }]] } };
}

/** "Mission score 78 · Safe: a rating of chain facts, not a promise", from the tool's data: plain text. */
export function scoreLine(token: ToolToken, words: CommunityDictionary, levelName: string): string {
  const score = Number.isFinite(token.score) ? Math.min(100, Math.max(0, Math.round(token.score))) : 0;
  return fmt(words.answer.scoreLine, { score, level: levelName });
}

/** Every language's answer label: an answer is known by its first line. */
export function answerLabels(all: readonly CommunityDictionary[]): ReadonlySet<string> {
  return new Set(all.map((d) => d.answer.label.trim()).filter((label) => label !== ""));
}
