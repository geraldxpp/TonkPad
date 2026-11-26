import type { Button, InlineKeyboard } from "../types";
import { isMessageLink, pressData } from "./alerts-buttons";
import type { ChatId } from "./types";

/**
 * What an alert's buttons say about it after a press (undo.ts): which of
 * them it still shows, and the alert's keyboard without the ones that were
 * used. Only buttons an alert can carry come back: its Open message link and
 * x: presses.
 */

/** A button as Telegram sent it back with a press: checked field by field. */
function buttonOf(raw: unknown): Button | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { text, url, callback_data: data } = raw as { text?: unknown; url?: unknown; callback_data?: unknown };
  if (typeof text !== "string" || text === "") return null;
  if (typeof data === "string") return /^x:[a-z0-9]{1,2}:(0|-\d{1,16}):\d{1,16}$/.test(data) ? { text, callback_data: data } : null;
  return typeof url === "string" && isMessageLink(url) ? { text, url } : null;
}

/** The alert's buttons, row by row, as far as they are an alert's. */
function rowsOf(markup: InlineKeyboard | undefined): Button[][] {
  const rows: unknown = markup?.inline_keyboard;
  if (!Array.isArray(rows)) return [];
  return rows.map((row: unknown) => (Array.isArray(row) ? row.map(buttonOf).filter((b): b is Button => b !== null) : []));
}

const dataOf = (b: Button): string | null => ("callback_data" in b ? b.callback_data : null);

/** Whether the alert still offers its Undo (a warning) or Unmute for this member: the offence it recorded hasn't been taken back from it. */
export function offersUndo(markup: InlineKeyboard | undefined, chat: ChatId, member: number): boolean {
  const undo = new Set([pressData("u", chat, member), pressData("m", chat, member)]);
  return rowsOf(markup).some((row) => row.some((b) => undo.has(dataOf(b))));
}

/** The alert's keyboard without these buttons' data (rows left empty go), or undefined when nothing is left. */
export function keyboardWithout(markup: InlineKeyboard | undefined, drop: ReadonlySet<string>): InlineKeyboard | undefined {
  const rows = rowsOf(markup)
    .map((row) => row.filter((b) => !drop.has(dataOf(b) ?? "")))
    .filter((row) => row.length > 0);
  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}

/**
 * Single-use claims on an alert's buttons, kept in memory for `windowMs`
 * (undo.ts: the alert's 47 hours) and at most `max` of them: a double tap,
 * a tap before the alert's edit lands, or one on a button whose edit was
 * dropped, never acts twice. Keys name the alert's message in the admin
 * chat and what is claimed, never a member. A claim that didn't take (a
 * refusal, a failed call) is released, so the button can be pressed again.
 */
export function createClaims(windowMs: number, max: number): { take(key: string, now: number): boolean; release(key: string): void } {
  const held = new Map<string, number>();
  function forget(now: number): void {
    // Claims go in as they are made, oldest first, so the sweep stops at the first one still live.
    for (const [key, at] of held) {
      if (now - at < windowMs && held.size <= max) break;
      held.delete(key);
    }
  }
  return {
    take(key, now) {
      forget(now);
      if (held.has(key)) return false;
      held.set(key, now);
      return true;
    },
    release: (key) => void held.delete(key),
  };
}

/**
 * An alert's edit after a press, tried once more `laterMs` later when the
 * admin chat's queue dropped it (false). Never rejects; the alert's text is
 * held no longer than that.
 */
export function editTwice(edit: () => Promise<boolean>, laterMs: number): void {
  const once = () => edit().catch(() => false);
  void once().then((done) => {
    if (done) return;
    const timer = setTimeout(() => void once(), laterMs);
    timer.unref?.();
  });
}
