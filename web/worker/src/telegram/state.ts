import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type MenuScope, readMenus } from "./profile-menus";

/**
 * What the bot keeps between restarts, on the worker's volume. No user data:
 * only the channel's posted keys and progress, the profile's hash (so the
 * commands and descriptions are set again only when they change), and the
 * chat-scoped menus set in the community's groups and admin chat (chat IDs
 * only, so one no longer wanted is deleted).
 */
export interface BotState {
  v: 1;
  profileHash: string;
  menus: MenuScope[];
  channel: {
    /** Keys of posts already made ("launch:<token>", "m50:<token>", …), newest last. */
    keys: string[];
    /** The highest curve milestone seen per launch: 0, 50, 90, or 100 once graduated. */
    milestones: Record<string, number>;
    /** Each launch's creator-lock end (unix seconds) when last seen, 0 without a lock. */
    lockEnds: Record<string, number>;
    /** When each launch's lock extension was last posted (ms): at most one a day. */
    lockPostedAt: Record<string, number>;
  };
}

export const KEYS_MAX = 1_000;

export const emptyState = (): BotState => ({ v: 1, profileHash: "", menus: [], channel: { keys: [], milestones: {}, lockEnds: {}, lockPostedAt: {} } });

function numbers(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "number" && Number.isFinite(v)));
}

export async function loadBotState(path: string): Promise<BotState> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<BotState> | null;
    if (!raw || raw.v !== 1) return emptyState();
    const keys = Array.isArray(raw.channel?.keys) ? raw.channel.keys.filter((k): k is string => typeof k === "string") : [];
    return {
      v: 1,
      profileHash: typeof raw.profileHash === "string" ? raw.profileHash : "",
      menus: readMenus(raw.menus),
      channel: { keys: keys.slice(-KEYS_MAX), milestones: numbers(raw.channel?.milestones), lockEnds: numbers(raw.channel?.lockEnds), lockPostedAt: numbers(raw.channel?.lockPostedAt) },
    };
  } catch {
    return emptyState();
  }
}

/** Written whole to a temporary file, then renamed over the old one, so a crash never leaves half a file. */
export async function saveBotState(path: string, state: BotState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state));
  await rename(tmp, path);
}
