import type { AdminAction } from "./alerts-buttons";
import type { AdminRight, ChatId } from "./types";

/** The right each alert action needs in the group it acts on. */
export const RIGHTS: Readonly<Record<AdminAction, AdminRight>> = {
  u: "restrict",
  m: "restrict",
  b0: "restrict",
  b: "restrict",
  t: "restrict",
  d: "delete",
  q: "restrict",
  r: "restrict",
  h: "any",
};

/** The buttons that act once on an alert, and those each removes from it once it took: Trust also lifts a mute and takes the offence back. */
export const ONCE: Partial<Record<AdminAction, readonly AdminAction[]>> = { u: ["u"], m: ["m"], b0: ["b0"], t: ["t", "u", "m"] };
/** Actions that restrict or ban the member, which Telegram refuses for an administrator: Trust (it lifts restrictions), Ban, Unmute and Mute 1 h. */
export const ON_MEMBER: ReadonlySet<AdminAction> = new Set<AdminAction>(["t", "b", "m", "q"]);

const isAction = (code: string): code is AdminAction => Object.prototype.hasOwnProperty.call(RIGHTS, code);

export interface UndoPress {
  action: AdminAction;
  /** The community group, or 0 for Handled on an alert about no group. */
  chat: ChatId;
  /** A member's ID, a message ID, or 0 (end raid mode, handled). */
  target: number;
}

/** x:<action>:<chat>:<user or message>, every part checked; null for anything else. */
export function parsePress(data: string): UndoPress | null {
  const [prefix, action, rawChat, rawTarget, ...rest] = data.split(":");
  if (prefix !== "x" || rest.length > 0 || action === undefined || !isAction(action)) return null;
  if (!/^(0|-\d{1,16})$/.test(rawChat ?? "") || !/^\d{1,16}$/.test(rawTarget ?? "")) return null;
  const chat = Number(rawChat);
  const target = Number(rawTarget);
  if (!Number.isSafeInteger(chat) || !Number.isSafeInteger(target)) return null;
  const none = action === "r" || action === "h";
  if (none ? target !== 0 : target <= 0) return null;
  if (chat === 0 && action !== "h") return null;
  return { action, chat, target };
}
