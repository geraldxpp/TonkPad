import { loadCommunityConfig } from "./community/config";
import { type CommunityDeps, startCommunity } from "./community/index";
import type { CommunityHooks } from "./community/types";
import type { BotSelf } from "./context";
import { updateChat } from "./press";
import type { ProfileOptions } from "./profile";
import type { TgUpdate, TgUser } from "./types";

/**
 * Where module 14's bot meets the community agent (module 15): starting it
 * once getMe has answered, the bot's own ID and usernames, and what its
 * menus need to know.
 */

/** A username as Telegram allows one (collectible ones included). */
const USERNAME = /^[A-Za-z0-9_]{4,32}$/;

/** The bot from getMe: its ID, and its username with every active one (BotFullInfo's active_usernames), each once. */
export function selfOf(me: TgUser): BotSelf {
  const names = [me.username, ...(Array.isArray(me.active_usernames) ? me.active_usernames : [])];
  const seen = new Map<string, string>();
  for (const name of names) if (typeof name === "string" && USERNAME.test(name) && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  return { id: me.id, usernames: [...seen.values()] };
}

/**
 * Which updates wait while the community agent starts (the poller holds
 * them, 2 minutes at most, until it is ready): those of the community
 * groups and the admin chat as configured, so its moderation sees them.
 * Everything else is module 14's and answered at once. Null when community
 * mode isn't configured: nothing waits.
 */
export function startingChats(env: CommunityDeps["env"], snapshotPath: string): ((u: TgUpdate) => boolean) | null {
  try {
    const { config } = loadCommunityConfig(env, snapshotPath);
    const admin = config?.adminChat;
    const chats = new Set<number>([...(config?.chats ?? []), ...(typeof admin === "number" ? [admin] : [])]);
    if (chats.size === 0) return null;
    return (u) => {
      const chat = updateChat(u);
      return chat !== null && chats.has(chat);
    };
  } catch {
    return null;
  }
}

/**
 * Starts the community agent, or returns null when it is off or failed to
 * start (the bot then runs as module 14 alone). Its lines are marked as the
 * community's; an error is logged by its name only, never its message.
 */
export async function wireCommunity(deps: CommunityDeps): Promise<CommunityHooks | null> {
  const log = (line: string) => deps.log(line.startsWith("community") ? line : `community: ${line}`);
  try {
    return await startCommunity({ ...deps, log });
  } catch (error) {
    log(`community off: it didn't start (${error instanceof Error ? error.name : "error"})`);
    return null;
  }
}

const NONE: ProfileOptions = { privateAi: false, reports: false, communityChats: [], adminChat: null, ai: false };

/**
 * What the menus and profile offer with this community agent, as it is now:
 * /ask in private chats while private AI can answer, /report when reports
 * reach an admin chat, menus for the groups and the admin chat that passed
 * their checks, and the AI descriptions while AI can answer somewhere (a
 * usable key, with private AI on or a community group running). Without the
 * agent, or with it off, module 14's alone.
 */
export function profileOptions(hooks: CommunityHooks | null, env: CommunityDeps["env"], snapshotPath: string): ProfileOptions {
  if (!hooks) return NONE;
  try {
    const { config } = loadCommunityConfig(env, snapshotPath);
    if (!config) return NONE;
    const adminChat = config.adminChat !== null && hooks.isAdminChat(config.adminChat) ? config.adminChat : null;
    const communityChats = config.chats.filter((chat) => hooks.owns(chat));
    const privateAi = config.privateAi && hooks.aiOn();
    const groupAi = communityChats.length > 0 && (hooks.groupAi?.() ?? hooks.aiOn());
    return { privateAi, reports: adminChat !== null, communityChats, adminChat, ai: privateAi || groupAi };
  } catch {
    // Module 14's menus alone, rather than none.
    return NONE;
  }
}
