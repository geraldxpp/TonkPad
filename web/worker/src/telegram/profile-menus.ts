import { LOCALES } from "@/shared/i18n/config";

/**
 * The chat-scoped command menus (module 15): each community group has one
 * for its members (Telegram's "chat" scope) and one for its admins
 * ("chat_administrators"), and the admin chat its own ("chat"). Telegram
 * keeps a chat's menu until it is deleted, so the ones set are remembered
 * (chat IDs only, in telegram.json) and a menu no longer wanted is deleted
 * at the next sync, in every language it was set in.
 */

export type MenuType = "chat" | "chat_administrators";

/** One chat-scoped menu as set. `misses`: syncs in a row whose delete failed, while it waits to be deleted. */
export interface MenuScope {
  type: MenuType;
  chat: number;
  misses?: number;
}

/** A menu whose delete failed this many syncs in a row is forgotten: the bot is most likely out of that chat, where no one sees it. */
export const MISSES_MAX = 3;
/** At most this many are remembered (a few groups and the admin chat use five). */
const MENUS_MAX = 100;

type Call = [method: string, params: Record<string, unknown>];

const isChat = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n !== 0;
const same = (a: MenuScope, b: MenuScope) => a.type === b.type && a.chat === b.chat;

/** The menus these options set: each group's members' and admins', then the admin chat's. */
export function menuScopes(o: { communityChats: readonly number[]; adminChat: number | null }): MenuScope[] {
  const groups = o.communityChats.flatMap((chat): MenuScope[] => [{ type: "chat", chat }, { type: "chat_administrators", chat }]);
  return o.adminChat !== null ? [...groups, { type: "chat", chat: o.adminChat }] : groups;
}

/** The menus set before that these options no longer set. */
export const staleScopes = (previous: readonly MenuScope[], wanted: readonly MenuScope[]): MenuScope[] => previous.filter((p) => !wanted.some((w) => same(w, p)));

/** deleteMyCommands for one menu in every language it was set in (English as the default, the rest by language code). */
export function deleteCalls(scope: MenuScope): Call[] {
  return LOCALES.map(({ code }): Call => ["deleteMyCommands", { scope: { type: scope.type, chat_id: scope.chat }, ...(code === "en" ? {} : { language_code: code }) }]);
}

/** The remembered menus from telegram.json: anything malformed is left out. */
export function readMenus(raw: unknown): MenuScope[] {
  if (!Array.isArray(raw)) return [];
  const menus: MenuScope[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const { type, chat, misses } = value as Record<string, unknown>;
    if ((type !== "chat" && type !== "chat_administrators") || !isChat(chat)) continue;
    const scope: MenuScope = { type, chat };
    if (typeof misses === "number" && Number.isSafeInteger(misses) && misses > 0) scope.misses = Math.min(misses, MISSES_MAX);
    if (!menus.some((m) => same(m, scope))) menus.push(scope);
  }
  return menus.slice(0, MENUS_MAX);
}
