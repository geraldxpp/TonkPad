import { type Locale, plural } from "@/shared/i18n/config";
import { escapeHtml as esc, fill, safeText } from "../text";
import { ownWords, phrases } from "./alerts-view-text";
import type { AdminAlert, ChatId, UserId } from "./types";
import type { CommunityDictionary } from "./words";

/**
 * How an alert looks in the team's admin chat. Everything is written by code
 * from the bot's own words. What the bot did (`done`) is its own words, only
 * escaped, so amounts, full stops and commands read as written; whoever
 * fills it cleans any name or title it holds first. What a member or the
 * model wrote goes through safeText, so it can't carry markup or turn into
 * a live link, @mention or command: a name, an excerpt and a reporter's
 * reason wholly; the AI's guess and an answer the bot would have given keep
 * the colons that end a phrase, through phrases(). The only address an
 * alert carries is its Open message button (alerts-buttons.ts).
 */

const MINUTE = 60_000;
/** At most this many characters of a member's message, or of a reporter's reason. */
export const EXCERPT_MAX = 300;
/** An answer the bot would have given: a group answer is clipped at 700. */
const PREVIEW_MAX = 700;
/** The bot's own words are never cut but to keep an alert inside Telegram's 4,096 characters. */
const DONE_MAX = 1_000;
/** A digest stops adding items past this much HTML, well inside Telegram's 4,096 characters. */
const DIGEST_MAX = 3_500;

/** Never an excerpt, by kind or case: a secret, or a flaw's details. */
const NO_EXCERPT: ReadonlySet<string> = new Set(["secret", "secret_probable", "security_report", "security", "contact_info"]);
/** In a digest only these, and cases that need a person, keep their excerpt. */
const SCAMS: ReadonlySet<string> = new Set(["lookalike", "phishing", "fake_support", "impersonation", "link_raid", "model_scam", "scam_report"]);
/** What a Telegram username is made of; anything else is cleaned like a name. */
const USERNAME = /^[A-Za-z0-9_]{1,32}$/;

export interface ViewContext {
  words: CommunityDictionary;
  /** The admins' language, for plural forms. */
  lang: Locale;
  now: number;
  groupTitle: (chat: ChatId) => string;
}

/** How long ago, in its largest whole unit ("3 days"), by the language's plural forms. */
export function ago(ms: number, words: CommunityDictionary, lang: Locale): string {
  const minutes = Math.max(1, Math.floor(ms / MINUTE));
  if (minutes < 60) return plural(lang, words.mod.minutes, minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(lang, words.mod.hours, hours);
  return plural(lang, words.mod.days, Math.floor(hours / 24));
}

/** "Action · Unknown link · the group": the kind in bold (underlined when a member is at risk), then the case and the group. */
function head(a: AdminAlert, ctx: ViewContext, marked = false): string {
  const w = ctx.words.admin;
  const parts: string[] = [];
  const kind = w.kinds[a.kind];
  if (kind) parts.push(marked ? `<u><b>${esc(kind)}</b></u>` : `<b>${esc(kind)}</b>`);
  const category = a.category ? w.categories[a.category] : undefined;
  if (category) parts.push(esc(category));
  const group = a.chat !== null ? title(a.chat, ctx) : "";
  if (group) parts.push(group);
  return parts.join(" · ");
}

/** The group's title, cleaned; an alert still goes out without it when it can't be read. */
function title(chat: ChatId, ctx: ViewContext): string {
  try {
    return safeText(ctx.groupTitle(chat), 64);
  } catch {
    return "";
  }
}

/** "Sam · <code>sam</code> · <code>101</code>": the cleaned name, then the username without @ and the ID as code, so neither is a tap-to-DM link. */
function personParts(p: { id: UserId | null; name: string; username: string | null }): string[] {
  const parts: string[] = [];
  const name = safeText(p.name, 64);
  if (name) parts.push(name);
  if (p.username) parts.push(`<code>${USERNAME.test(p.username) ? p.username : safeText(p.username, 32)}</code>`);
  if (p.id !== null && Number.isSafeInteger(p.id)) parts.push(`<code>${p.id}</code>`);
  return parts;
}

/** "New here: Sam · <code>sam</code> · <code>101</code> · 2 hours". */
function memberLine(a: AdminAlert, ctx: ViewContext): string | null {
  const m = a.member;
  if (!m) return null;
  const parts = personParts(m);
  // `since` is known only for someone the bot saw join: their time in the group, and "New here".
  let label = ctx.words.admin.member;
  const since = m.since;
  if (since !== null && Number.isFinite(since)) {
    parts.push(esc(ago(ctx.now - since, ctx.words, ctx.lang)));
    label = ctx.words.admin.newMember;
  }
  return parts.length > 0 ? `${esc(label)}: ${parts.join(" · ")}` : null;
}

/** "Reported by: Rae · <code>rae</code> · <code>301</code>": who sent a /report, drawn like the member. */
function reporterLine(a: AdminAlert, ctx: ViewContext): string | null {
  const parts = a.reporter ? personParts(a.reporter) : [];
  return parts.length > 0 ? `${esc(ctx.words.admin.reportedBy)}: ${parts.join(" · ")}` : null;
}

/** A review's current restriction ("Muted"), in the bot's own words. */
function standingLine(a: AdminAlert, ctx: ViewContext): string | null {
  const word: unknown = a.standing ? ctx.words.admin.standing[a.standing] : undefined;
  return typeof word === "string" && word !== "" ? esc(word) : null;
}

/** The member's words, cleaned and cut to 300 characters; never for a secret or a flaw report. */
function excerptLine(a: AdminAlert, ctx: ViewContext): string | null {
  if (!a.excerpt || NO_EXCERPT.has(a.kind) || (a.category !== null && NO_EXCERPT.has(a.category))) return null;
  const text = safeText(a.excerpt, EXCERPT_MAX);
  return text ? `${esc(ctx.words.admin.excerpt)}: ${text}` : null;
}

/** The reason a reporter gave, in their own words: cleaned like an excerpt, and kept out where an excerpt is, under its own label. */
function reasonLine(a: AdminAlert, ctx: ViewContext): string | null {
  if (!a.reason || NO_EXCERPT.has(a.kind) || (a.category !== null && NO_EXCERPT.has(a.category))) return null;
  const text = safeText(a.reason, EXCERPT_MAX);
  return text ? `${esc(ctx.words.admin.reportReason)}: ${text}` : null;
}

/** A preview alert's answer is the model's text, never the bot's own words, even from a producer that put it in `done`. */
const previewText = (a: AdminAlert): string | null => a.preview || (a.kind === "preview" ? a.done : null);

/** What the bot did, in its own words: escaped, nothing else. */
function doneLine(a: AdminAlert, ctx: ViewContext): string | null {
  const own = a.kind === "preview" && !a.preview ? null : a.done;
  const text = own ? ownWords(own, DONE_MAX) : "";
  return text ? `${esc(ctx.words.admin.done)}: ${text}` : null;
}

/** An answer the bot would have given (observe mode): the model's text, cleaned like its guess, under its own label. */
function previewLine(a: AdminAlert, ctx: ViewContext): string | null {
  const raw = previewText(a);
  const text = raw ? phrases(raw, PREVIEW_MAX) : "";
  return text ? `${esc(ctx.words.admin.preview)}: ${text}` : null;
}

/** The model's one-line reason: last, in italics and labelled, so nobody takes it for a fact. */
function guessLine(a: AdminAlert, ctx: ViewContext): string | null {
  const text = a.aiGuess ? phrases(a.aiGuess, 200) : "";
  return text ? `<i>${esc(ctx.words.admin.aiGuess)}: ${text}</i>` : null;
}

const present = (lines: ReadonlyArray<string | null>): string[] => lines.filter((line): line is string => line !== null);
/** The member, who reported them and where they stand, in that order. */
const people = (a: AdminAlert, ctx: ViewContext) => [memberLine(a, ctx), reporterLine(a, ctx), standingLine(a, ctx)];

/** One alert: a member at risk is marked first; the AI's guess comes last, then the reminder never to DM first. */
export function alertHtml(a: AdminAlert, ctx: ViewContext): string {
  const crisis = a.kind === "crisis";
  const mark = a.urgent && !crisis ? [`<u><b>${esc(ctx.words.admin.kinds.crisis)}</b></u>`] : [];
  const body = present([head(a, ctx, a.urgent && crisis), ...people(a, ctx), excerptLine(a, ctx), reasonLine(a, ctx), doneLine(a, ctx), previewLine(a, ctx), guessLine(a, ctx)]);
  return [...mark, ...body, "", esc(ctx.words.admin.neverDm)].join("\n");
}

/** One item of a digest or a storm's summary: no buttons and no AI guess; a member's words (an excerpt, a reason) only for a scam or a case that needs a person. */
function itemHtml(a: AdminAlert, ctx: ViewContext): string {
  const words = SCAMS.has(a.category ?? "") || !a.routine;
  return present([head(a, ctx), ...people(a, ctx), doneLine(a, ctx), previewLine(a, ctx), words ? excerptLine(a, ctx) : null, words ? reasonLine(a, ctx) : null]).join("\n");
}

/** Several alerts in one message, as many as fit, then "and N more". */
export function digestHtml(items: readonly AdminAlert[], extra: number, ctx: ViewContext): string {
  const w = ctx.words;
  const parts = [`<b>${esc(w.admin.kinds.digest)}</b> · ${items.length + extra}`];
  let size = parts[0].length;
  let shown = 0;
  for (const a of items) {
    const html = itemHtml(a, ctx);
    if (size + html.length > DIGEST_MAX) break;
    parts.push(html);
    size += html.length + 2;
    shown += 1;
  }
  const more = items.length - shown + extra;
  if (more > 0) parts.push(fill(w.admin.more, { count: more }));
  parts.push(esc(w.admin.neverDm));
  return parts.join("\n\n");
}
