import { visibleText } from "../../text";
import { findAddress, isTokenAddress } from "../text";
import type { TgMessage } from "../types";

/**
 * What a reply to one of the bot's own messages carries (split from
 * triggers.ts): its answer without the frame, or the token on its card.
 * Messages and their markup come from Telegram and are checked field by field.
 */

export type Span = readonly [start: number, end: number];

/** A message's words (its text, else its caption) and Telegram's markup of them. */
export function wordsOf(m: TgMessage): { text: string; entities: readonly unknown[] } {
  if (typeof m.text === "string") return { text: m.text, entities: Array.isArray(m.entities) ? m.entities : [] };
  if (typeof m.caption === "string") return { text: m.caption, entities: Array.isArray(m.caption_entities) ? m.caption_entities : [] };
  return { text: "", entities: [] };
}

/** An entity of this type, with a span inside the text (entities are untrusted). */
export function spanOf(entity: unknown, type: string, text: string): Span | null {
  if (typeof entity !== "object" || entity === null) return null;
  const { type: kind, offset, length } = entity as { type?: unknown; offset?: unknown; length?: unknown };
  if (kind !== type || typeof offset !== "number" || typeof length !== "number") return null;
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 1 || offset + length > text.length) return null;
  return [offset, offset + length];
}

/** The first "r:" callback on a message: a module-14 card's Refresh button. */
function refreshData(m: TgMessage): string | null {
  const rows: unknown = m.reply_markup?.inline_keyboard;
  const buttons: unknown[] = Array.isArray(rows) ? rows.filter((row) => Array.isArray(row)).flat() : [];
  for (const button of buttons) {
    const data: unknown = typeof button === "object" && button !== null ? (button as { callback_data?: unknown }).callback_data : null;
    if (typeof data === "string" && data.startsWith("r:")) return data;
  }
  return null;
}

/**
 * The card's token: the address its Refresh button carries (r:<lang>:<address>,
 * or the older r:<address>), else the first address in its text. The button
 * comes first because the card's first line is the token's own name, which
 * its creator could make look like another token's address.
 */
function cardAddressOf(card: TgMessage, data: string): string | null {
  const parts = data.split(":");
  const raw = (parts.length === 3 ? parts[2] : parts[1]) ?? "";
  const address = raw.startsWith("0x") ? raw.toLowerCase() : raw;
  return isTokenAddress(address) ? address : findAddress(wordsOf(card).text);
}

/** An italic entity covers the text from `start` to `end`. */
function italic(text: string, entities: readonly unknown[], start: number, end: number): boolean {
  return entities.some((e) => {
    const span = spanOf(e, "italic", text);
    return span !== null && span[0] <= start && span[1] >= end;
  });
}

/**
 * One of the bot's answers without its frame (agent/render.ts writes an
 * italic label first; until 26 Nov 2026 also an italic footer last): null when the first line
 * isn't a label, "" when nothing is left. A last line that is neither italic
 * nor a frame line (labels may hold the footers too) is kept.
 */
function answerBody(answer: TgMessage, labels: ReadonlySet<string>): string | null {
  const { text, entities } = wordsOf(answer);
  const lines = text.split("\n");
  const isFrame = (line: string) => labels.has(line.trim()) || labels.has(visibleText(line));
  if (!isFrame(lines[0])) return null;
  let end = text.length;
  let last = lines.length - 1;
  while (last > 0 && lines[last].trim() === "") end -= lines[last--].length + 1;
  const line = lines[last];
  const start = end - line.length + (line.length - line.trimStart().length);
  const trimmedEnd = end - (line.length - line.trimEnd().length);
  if (last > 0 && (isFrame(line) || italic(text, entities, start, trimmedEnd))) last -= 1;
  return lines.slice(1, last + 1).map(visibleText).filter(Boolean).join("\n");
}

/** What replying to one of the bot's messages carries: its answer or its card; null for its other messages. */
export function replyContext(r: TgMessage, labels: ReadonlySet<string>): { earlierAnswer: string | null; cardAddress: string | null } | null {
  const body = answerBody(r, labels);
  if (body !== null) return { earlierAnswer: body || null, cardAddress: null };
  const data = refreshData(r);
  return data ? { earlierAnswer: null, cardAddress: cardAddressOf(r, data) } : null;
}
