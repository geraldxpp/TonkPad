import { createHash } from "node:crypto";
import { LOCALES } from "@/shared/i18n/config";
import { BOT_DICTIONARIES } from "./i18n";
import type { Sender } from "./sender";
import type { BotCommand } from "./types";

type Call = [method: string, params: Record<string, unknown>];

const PRIVATE = ["start", "check", "launches", "referral", "help"] as const;
const GROUP = ["check", "help"] as const;

/**
 * Everything the bot sets about itself, in every language: the commands menu
 * (private chats and groups have their own), the description an empty chat
 * shows, the short description on its profile, and the menu button. English
 * is the default; each other language is set for its Telegram language code.
 */
export function profileCalls(): Call[] {
  const calls: Call[] = [];
  for (const { code } of LOCALES) {
    const d = BOT_DICTIONARIES[code];
    const language = code === "en" ? {} : { language_code: code };
    const list = (names: readonly (keyof typeof d.commands)[]): BotCommand[] => names.map((command) => ({ command, description: d.commands[command].slice(0, 256) }));
    calls.push(["setMyCommands", { commands: list(PRIVATE), scope: { type: "all_private_chats" }, ...language }]);
    calls.push(["setMyCommands", { commands: list(GROUP), scope: { type: "all_group_chats" }, ...language }]);
    calls.push(["setMyDescription", { description: d.profile.description.slice(0, 512), ...language }]);
    calls.push(["setMyShortDescription", { short_description: d.profile.short.slice(0, 120), ...language }]);
  }
  calls.push(["setChatMenuButton", { menu_button: { type: "commands" } }]);
  return calls;
}

/** The profile's fingerprint for one bot: a new bot (another token) is set up again even with the same words. */
export const profileHash = (calls: readonly Call[], botId: number) => createHash("sha256").update(JSON.stringify([botId, calls])).digest("hex");

/** Sets the profile when it differs from the one last set for this bot; returns the new hash, or null when nothing was (fully) set. */
export async function syncProfile(sender: Sender, previousHash: string, log: (line: string) => void, botId: number): Promise<string | null> {
  const calls = profileCalls();
  const hash = profileHash(calls, botId);
  if (hash === previousHash) return null;
  let failed = 0;
  for (const [method, params] of calls) if ((await sender.direct(method, params)) === null) failed += 1;
  log(failed === 0 ? `profile set in ${LOCALES.length} languages` : `profile: ${failed} of ${calls.length} calls failed; trying again at the next start`);
  return failed === 0 ? hash : null;
}
