import { createHash } from "node:crypto";
import { type Locale, LOCALES } from "@/shared/i18n/config";
import { BOT_DICTIONARIES } from "./i18n";
import { communityWords } from "./i18n/community";
import { deleteCalls, type MenuScope, menuScopes, MISSES_MAX, staleScopes } from "./profile-menus";
import type { Sender } from "./sender";
import type { BotCommand } from "./types";

export type { MenuScope } from "./profile-menus";

export type Call = [method: string, params: Record<string, unknown>];

/** What the community agent adds to the menus (module 15); without it, module 14's profile alone. */
export interface ProfileOptions {
  /** /ask in private chats. */
  privateAi: boolean;
  /** /report in private chats (it needs the admin chat). */
  reports: boolean;
  /** The community groups that passed their checks: their own menus, for members and for admins. */
  communityChats: readonly number[];
  /** The team's admin chat: its own menu. */
  adminChat: number | null;
  /** AI can answer (a usable key, with private AI on or community groups that passed their checks): the descriptions then say so, naming Claude and Anthropic; else module 14's own. */
  ai: boolean;
}

const NONE: ProfileOptions = { privateAi: false, reports: false, communityChats: [], adminChat: null, ai: false };

/** What was last set for this bot (telegram.json): the profile's hash, and the chat-scoped menus, so one no longer wanted is deleted. */
export interface ProfileState {
  hash: string;
  menus: readonly MenuScope[];
}

type Name = keyof typeof BOT_DICTIONARIES.en.commands | keyof ReturnType<typeof communityWords>["commands"];

const GROUP: readonly Name[] = ["check", "help"];
/** A community group's members, then its admins (Telegram's chat_administrators scope), then the admin chat. */
const MEMBERS: readonly Name[] = ["ask", "check", "rules", "report", "help"];
const ADMINS: readonly Name[] = [...MEMBERS, "status", "pause", "resume", "proactive", "strict", "raid", "trust", "untrust", "trusted", "forget", "mod"];
const ADMIN_CHAT: readonly Name[] = ["mod", "status", "forget", "ai"];

/** /start, /ask when private AI is on, /check, /launches, /referral, /report when reports go somewhere, /help. */
function privateNames(o: ProfileOptions): Name[] {
  return ["start", ...(o.privateAi ? (["ask"] as const) : []), "check", "launches", "referral", ...(o.reports ? (["report"] as const) : []), "help"];
}

/** Each command's description in one language: module 14's words, then the community's, cut to Telegram's 256. */
function commandsIn(code: Locale): (names: readonly Name[]) => BotCommand[] {
  const own: Record<string, string> = BOT_DICTIONARIES[code].commands;
  const community: Record<string, string> = communityWords(code).commands;
  return (names) => names.map((command) => ({ command, description: (Object.hasOwn(own, command) ? own[command] : community[command] ?? "").slice(0, 256) }));
}

/**
 * Everything the bot sets about itself, in every language: the commands menu
 * (private chats and groups have their own; with the community agent, each
 * community group has one for members and one for its admins, and the admin
 * chat its own), the description an empty chat shows, the short description
 * on its profile (the AI texts only while AI can answer), and the menu
 * button. English is the default; each other language is set for its
 * Telegram language code.
 */
export function profileCalls(options: ProfileOptions = NONE): Call[] {
  const calls: Call[] = [];
  for (const { code } of LOCALES) {
    const d = BOT_DICTIONARIES[code];
    const language = code === "en" ? {} : { language_code: code };
    const list = commandsIn(code);
    const set = (names: readonly Name[], scope: Record<string, unknown>) => calls.push(["setMyCommands", { commands: list(names), scope, ...language }]);
    set(privateNames(options), { type: "all_private_chats" });
    set(GROUP, { type: "all_group_chats" });
    for (const chat of options.communityChats) {
      set(MEMBERS, { type: "chat", chat_id: chat });
      set(ADMINS, { type: "chat_administrators", chat_id: chat });
    }
    if (options.adminChat !== null) set(ADMIN_CHAT, { type: "chat", chat_id: options.adminChat });
    const description = options.ai ? d.profile.descriptionAi : d.profile.description;
    const short = options.ai ? d.profile.shortAi : d.profile.short;
    calls.push(["setMyDescription", { description: description.slice(0, 512), ...language }]);
    calls.push(["setMyShortDescription", { short_description: short.slice(0, 120), ...language }]);
  }
  calls.push(["setChatMenuButton", { menu_button: { type: "commands" } }]);
  return calls;
}

/** The profile's fingerprint for one bot: a new bot (another token) is set up again even with the same words. The calls carry the options. */
export const profileHash = (calls: readonly Call[], botId: number) => createHash("sha256").update(JSON.stringify([botId, calls])).digest("hex");

/** Sends each call; returns how many failed. */
async function send(sender: Sender, calls: readonly Call[]): Promise<number> {
  let failed = 0;
  for (const [method, params] of calls) if ((await sender.direct(method, params)) === null) failed += 1;
  return failed;
}

/**
 * Sets the profile when it differs from the one last set for this bot, after
 * deleting the chat-scoped menus it no longer sets (a dropped group's, an old
 * admin chat's), so they go before a chat that changed role gets its new
 * one. Returns what to remember, or null when nothing was to do. A failed
 * set leaves the hash empty, so everything is set again at the next sync; a
 * failed delete keeps its menu, tried again at each sync and forgotten after
 * 3 that failed (the bot is most likely out of that chat).
 */
export async function syncProfile(sender: Sender, previous: ProfileState, log: (line: string) => void, botId: number, options: ProfileOptions = NONE): Promise<ProfileState | null> {
  const calls = profileCalls(options);
  const hash = profileHash(calls, botId);
  const wanted = menuScopes(options);
  const stale = staleScopes(previous.menus, wanted);
  const setting = hash !== previous.hash;
  if (!setting && stale.length === 0) return null;
  const kept: MenuScope[] = [];
  let failed = 0;
  let total = 0;
  for (const scope of stale) {
    const deletes = deleteCalls(scope);
    const missed = await send(sender, deletes);
    total += deletes.length;
    failed += missed;
    const misses = (scope.misses ?? 0) + 1;
    if (missed === 0) continue;
    if (misses < MISSES_MAX) kept.push({ ...scope, misses });
    else log(`profile: an old menu in chat ${scope.chat} couldn't be deleted at ${MISSES_MAX} syncs; it is forgotten`);
  }
  const setFailed = setting ? await send(sender, calls) : 0;
  total += setting ? calls.length : 0;
  failed += setFailed;
  if (failed > 0) log(`profile: ${failed} of ${total} calls failed; trying again at the next sync`);
  else log([setting ? `profile set in ${LOCALES.length} languages` : "", stale.length > 0 ? `${stale.length} old menu${stale.length === 1 ? "" : "s"} deleted` : ""].filter(Boolean).join("; "));
  return { hash: setting ? (setFailed === 0 ? hash : "") : previous.hash, menus: [...wanted, ...kept] };
}
