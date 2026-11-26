import type { TgCallbackQuery, TgUpdate } from "./types";

/**
 * The community's button data: the new-member check (h:), an admin alert's
 * actions (x:), the admin panel (p:), Ask (a:), Share with the team (s:), a
 * review request (ap:), and the Ask prompt (askp, the whole data). Module 14's
 * own buttons (r:, l:, c:, home, help, check, ref) start with none of these.
 */
export const COMMUNITY_PRESSES: readonly string[] = ["h:", "x:", "p:", "a:", "s:", "ap:", "askp"];

/** Whether a button's data belongs to the community: a prefix ending in ":", or "askp" exactly. */
export function isCommunityPress(data: string | undefined): boolean {
  if (typeof data !== "string") return false;
  return COMMUNITY_PRESSES.some((p) => (p.endsWith(":") ? data.startsWith(p) : data === p));
}

/** A callback button as Telegram sent it back: untrusted, so checked field by field. */
function callbackData(button: unknown): string | null {
  if (typeof button !== "object" || button === null || !("callback_data" in button)) return null;
  const data = (button as { callback_data: unknown }).callback_data;
  return typeof data === "string" ? data : null;
}

/**
 * Whether a press could have come from a button the bot really shows.
 * Telegram warns that a press's data needn't match any button (a client can
 * send any string), so a press on a message counts only when that message
 * still holds a callback button with exactly this data. A press on an inline
 * message (no `message`) passes: the bot can't read those, and its handler
 * checks its own data. A message too old for the bot to read comes without
 * its buttons, so a press there fails.
 */
export function pressMatches(q: TgCallbackQuery): boolean {
  if (!q.message) return true;
  const data = q.data;
  if (typeof data !== "string" || data === "") return false;
  const rows: unknown = q.message.reply_markup?.inline_keyboard;
  if (!Array.isArray(rows)) return false;
  return rows.some((row: unknown) => Array.isArray(row) && row.some((button: unknown) => callbackData(button) === data));
}

/** The chat an update is about (its message, edit, press or membership change), or null. */
export function updateChat(u: TgUpdate): number | null {
  const chat = u.message?.chat ?? u.edited_message?.chat ?? u.callback_query?.message?.chat ?? u.chat_member?.chat ?? u.my_chat_member?.chat;
  const id: unknown = chat?.id;
  return typeof id === "number" && Number.isSafeInteger(id) ? id : null;
}
