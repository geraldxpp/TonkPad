import type { Button, InlineKeyboard } from "../types";
import type { AdminAlert, ChatId } from "./types";
import type { AdminButton, CommunityDictionary } from "./words";

/**
 * An alert's buttons. Each callback carries what it acts on,
 * x:<action>:<chat>:<user or message>, so no list of cases is kept; undo.ts
 * checks every press against the presser's right in that group.
 */

/** Telegram's limit for a button's data, in bytes (the data is ASCII). */
const DATA_MAX = 64;
/** A message link as messageLink builds it: the only address an alert may carry. */
const MESSAGE_LINK = /^https:\/\/t\.me\/(c\/\d+|[A-Za-z0-9_]{4,32})\/(\d+\/)?\d+$/;

/** Whether an address is a message link as messageLink builds it. */
export const isMessageLink = (url: string): boolean => MESSAGE_LINK.test(url);

/** An admin button's action: u undo a warning, m unmute, b0 unban, b ban, t trust, d delete, q mute 1 h, r end raid mode, h handled. */
export type AdminAction = "u" | "m" | "b0" | "b" | "t" | "d" | "q" | "r" | "h";

/** A button's data, x:<action>:<chat>:<user or message>, or null past Telegram's 64 bytes. */
export function pressData(action: AdminAction, chat: ChatId, target: number): string | null {
  const data = `x:${action}:${chat}:${target}`;
  return data.length <= DATA_MAX ? data : null;
}

const UNDO: Record<NonNullable<AdminAlert["undo"]>, { button: AdminButton; code: AdminAction }> = {
  warn: { button: "undo", code: "u" },
  mute: { button: "unmute", code: "m" },
  ban: { button: "unban", code: "b0" },
};

interface Act {
  button: AdminButton;
  code: AdminAction;
  target: number;
}

const positive = (n: number | null | undefined): number | null => (typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null);

/**
 * What admins can do from an alert about a group: End raid mode on a raid;
 * Delete and Mute 1 h on a member's report; on what the bot did to a member,
 * its Undo (warning), Unmute or Unban, then Ban (unless banned already) and
 * Trust; on a review request its Undo and Trust. Cases that need a person
 * (lost funds, a crisis, a flaw…) only open the message.
 */
function acts(a: AdminAlert): Act[] {
  if (a.kind === "raid") return [{ button: "endRaid", code: "r", target: 0 }];
  const user = positive(a.member?.id);
  const message = positive(a.messageId);
  const list: Act[] = [];
  if (a.kind === "report") {
    if (message !== null) list.push({ button: "delete", code: "d", target: message });
    if (user !== null) list.push({ button: "mute", code: "q", target: user });
    return list;
  }
  if (user === null || (a.kind !== "action" && a.kind !== "appeal")) return list;
  if (a.undo) list.push({ ...UNDO[a.undo], target: user });
  if (a.kind === "action" && a.undo !== "ban") list.push({ button: "ban", code: "b", target: user });
  list.push({ button: "trust", code: "t", target: user });
  return list;
}

/** Open message first, the actions two to a row, and Handled last on anything with actions or that needs a person. */
export function alertKeyboard(a: AdminAlert, words: CommunityDictionary): InlineKeyboard | undefined {
  const b = words.admin.buttons;
  const rows: Button[][] = [];
  if (a.link && isMessageLink(a.link)) rows.push([{ text: b.open, url: a.link }]);
  const chat = a.chat;
  const buttons: Button[] = [];
  if (chat !== null) {
    for (const act of acts(a)) {
      const data = pressData(act.code, chat, act.target);
      if (data) buttons.push({ text: b[act.button], callback_data: data });
    }
  }
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  // An alert about no group (a private chat's share, the budget) is handled by an admin of any group: chat 0.
  const handled = buttons.length > 0 || !a.routine || a.urgent ? pressData("h", chat ?? 0, 0) : null;
  if (handled) rows.push([{ text: b.handled, callback_data: handled }]);
  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}
