import { type Locale, plural } from "@/shared/i18n/config";
import type { SendOptions } from "../community/out";
import type { ChatId, NoticeKind, UserId } from "../community/types";
import type { CommunityDictionary } from "../community/words";
import { escapeHtml as esc, fill } from "../text";
import type { Button, InlineKeyboard } from "../types";
import type { ModDeps, ModTarget } from "./actions";

/**
 * Public notices (prompts/15-community-agent.md, The ladder, and undo). They
 * never print a display name: they give the reason only and mention the
 * member with a fixed word linked to them (tg://user). The reason also goes
 * to the member alone as an ephemeral message (best effort), each notice
 * carries "Why? Ask for a review", and it is deleted after a minute.
 */

export const NOTICE_MS = 60_000;
const MAX_MENTIONS = 3;
const MINUTE_S = 60;
const HOUR_S = 3_600;
const DAY_S = 86_400;
/** A bot's username, as t.me/<bot> may hold it. */
const BOT_NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

/**
 * Fixed words linked to each user, never a name: at most three, then
 * `others(n)` for the rest ("and 2 more"). `word` is plain text; `others`
 * returns safe HTML, as fill(check.others, { count }) does.
 */
export function mentions(users: ReadonlyArray<{ id: UserId }>, word: string, others: (n: number) => string): string {
  const ids = [...new Set(users.map((u) => u.id))].filter((id) => Number.isSafeInteger(id) && id > 0);
  const links = ids.slice(0, MAX_MENTIONS).map((id) => `<a href="tg://user?id=${id}">${esc(word)}</a>`);
  const rest = ids.length - links.length;
  return rest > 0 ? `${links.join(", ")} ${others(rest)}` : links.join(", ");
}

/** Mentions in a language's own words: check.member linked to each, check.others past three. */
export const mentionsIn = (users: ReadonlyArray<{ id: UserId }>, d: CommunityDictionary): string =>
  mentions(users, d.check.member, (n) => fill(d.check.others, { count: n }));

/** "10 minutes", "24 hours", "7 days": whole units as people say them, by the language's plural forms. Plain text. */
export function durationText(seconds: number, d: CommunityDictionary, lang: Locale): string {
  const s = Math.max(MINUTE_S, Math.round(Number.isFinite(seconds) ? seconds : MINUTE_S));
  if (s >= 2 * DAY_S) return plural(lang, d.mod.days, Math.round(s / DAY_S));
  if (s >= HOUR_S) return plural(lang, d.mod.hours, Math.round(s / HOUR_S));
  return plural(lang, d.mod.minutes, Math.round(s / MINUTE_S));
}

/** What a notice says: a NoticeKind, or the link note (mod.linkRemoved) for a member's unknown link. */
export type NoticeTemplate = NoticeKind | "linkRemoved";

/** The notices that mention the member; the others are neutral lines. */
const MENTIONING: ReadonlySet<NoticeTemplate> = new Set<NoticeTemplate>(["removed", "linkRemoved", "warned", "muted", "banned", "newcomer"]);

/** Placeholder values, each already safe HTML. */
export interface NoticeValues {
  mentions?: string;
  reason?: string;
  duration?: string;
  count?: string;
}

/** A notice's HTML from the bot's own words; only {placeholders} take the values. */
export function noticeHtml(template: NoticeTemplate, d: CommunityDictionary, v: NoticeValues): string {
  const mentions = v.mentions ?? "";
  const reason = v.reason ?? "";
  switch (template) {
    case "removed":
      return fill(d.mod.removed, { mentions, reason });
    case "linkRemoved":
      return fill(d.mod.linkRemoved, { mentions });
    case "warned":
      return fill(d.mod.warned, { mentions, reason });
    case "muted":
      return fill(d.mod.muted, { mentions, reason, duration: v.duration ?? "" });
    case "banned":
      return fill(d.mod.banned, { mentions, reason });
    case "newcomer":
      return fill(d.mod.newcomer, { mentions });
    case "summary":
      return fill(d.mod.summary, { count: v.count ?? "0" });
    case "contact":
      return esc(d.safety.contact);
    case "secret":
      return esc(d.safety.secret);
    case "secret_probable":
      return esc(d.safety.secretProbable);
    case "dm_warning":
      return esc(d.safety.dmWarning);
    case "scam_report":
      return esc(d.safety.scamReport);
    case "flaw":
      return esc(d.answer.flaw);
  }
}

/** The review button (t.me/<bot>?start=appeal), when the bot's username is known. */
export function reviewButton(d: CommunityDictionary, deps: Pick<ModDeps, "bot">): Button | null {
  const bot = deps.bot();
  return bot && BOT_NAME.test(bot) ? { text: d.mod.why, url: `https://t.me/${bot}?start=appeal` } : null;
}

/** A flaw report's Security button first (when the site is known), then the review button. */
function noticeKeyboard(template: NoticeTemplate, d: CommunityDictionary, deps: ModDeps): InlineKeyboard | undefined {
  const rows: Button[][] = [];
  if (template === "flaw" && deps.site) rows.push([{ text: d.links.security, url: `${deps.site}/security` }]);
  const review = reviewButton(d, deps);
  if (review) rows.push([review]);
  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}

/** Sends a group message and deletes it after `keepMs`; resolves to its ID, or null when it wasn't sent. Never rejects. */
export async function sendAndExpire(deps: Pick<ModDeps, "out" | "log">, chat: ChatId, html: string, options: SendOptions, keepMs: number): Promise<number | null> {
  try {
    const id = await deps.out.send(chat, html, options);
    if (id !== null) deps.out.removeLater(chat, id, keepMs);
    return id;
  } catch {
    deps.log?.("a notice wasn't sent");
    return null;
  }
}

/**
 * Posts a notice about `target` in its chat and topic, also shown to the
 * member alone (best effort), with the review button, deleted after a
 * minute. A mentioning notice needs a member to mention, so a sender chat
 * gets none. Not awaited by moderation: a notice waits behind the group's
 * checks, and actions never wait on it.
 */
export function postNotice(template: NoticeTemplate, target: ModTarget, deps: ModDeps, values: NoticeValues, replyTo?: number): void {
  if (MENTIONING.has(template) && target.user === null) return;
  const d = deps.words(target.lang);
  const html = noticeHtml(template, d, { ...values, mentions: target.user !== null ? mentionsIn([{ id: target.user }], d) : "" });
  const options: SendOptions = { kind: "notice", thread: target.thread, replyTo, keyboard: noticeKeyboard(template, d, deps), ephemeralTo: target.user ?? undefined };
  void sendAndExpire(deps, target.chat, html, options, NOTICE_MS);
}

/**
 * A notice of `kind` about `target`. `values` fill {reason}, {duration} and
 * {count} and must be safe HTML; {mentions} is always the fixed word linked
 * to the member, never a name.
 */
export function notice(kind: NoticeKind, target: ModTarget, deps: ModDeps, values: Record<string, string>): void {
  postNotice(kind, target, deps, { reason: values.reason, duration: values.duration, count: values.count });
}
