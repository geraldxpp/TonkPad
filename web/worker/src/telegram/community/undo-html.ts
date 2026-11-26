import { escapeHtml as esc } from "../text";
import type { TgMessageEntity } from "../types";

/** The formatting an alert uses, as HTML tags; any other entity comes back as plain text. */
const TAGS: Readonly<Record<string, string>> = { bold: "b", italic: "i", underline: "u", strikethrough: "s", code: "code" };
const ORDER: readonly string[] = ["b", "i", "u", "s", "code"];
/** Leaves room for the line added below it within Telegram's 4,096 characters. */
const TEXT_MAX = 3_800;

interface Mark {
  tag: string;
  start: number;
  end: number;
}

/** At most `max` UTF-16 units (as Telegram counts entity offsets), never splitting a character. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const code = text.charCodeAt(max - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

/**
 * A message the bot sent, as HTML again, from the text and entities Telegram
 * returns with a button press, so an alert can be edited without losing its
 * formatting. Each run of characters with the same formatting is wrapped on
 * its own, so the tags always nest; code is never combined with another tag,
 * as Telegram requires; every piece of text is escaped.
 */
export function messageHtml(text: string, entities: readonly TgMessageEntity[] = []): string {
  const body = cut(text, TEXT_MAX);
  const marks: Mark[] = [];
  for (const e of entities) {
    const tag = typeof e?.type === "string" && Object.prototype.hasOwnProperty.call(TAGS, e.type) ? TAGS[e.type] : null;
    if (!tag || !Number.isSafeInteger(e.offset) || !Number.isSafeInteger(e.length) || e.offset < 0 || e.length <= 0) continue;
    const end = Math.min(body.length, e.offset + e.length);
    if (e.offset < end) marks.push({ tag, start: e.offset, end });
  }
  const points = [...new Set([0, body.length, ...marks.flatMap((m) => [m.start, m.end])])].sort((a, b) => a - b);
  let html = "";
  for (let i = 0; i + 1 < points.length; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    const tags = ORDER.filter((tag) => marks.some((m) => m.tag === tag && m.start <= from && m.end >= to));
    const wrap = tags.includes("code") ? ["code"] : tags;
    html += `${wrap.map((t) => `<${t}>`).join("")}${esc(body.slice(from, to))}${[...wrap].reverse().map((t) => `</${t}>`).join("")}`;
  }
  return html;
}
