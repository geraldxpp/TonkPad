import type { AdminLists } from "./admins";
import type { Read } from "./setup-read";
import type { ChatId } from "./types";

/**
 * Each running group's admin list at start, read with setup's retries (1
 * and 2 seconds): one failed read must not leave the admins moderated as
 * members. A group whose list Telegram still can't give is moderated as in
 * observe mode (only protective deletes, index-guard.ts) and read again
 * every 30 seconds from the tick (index-hooks-tick.ts). Logs group IDs only.
 */
export async function readAdminLists(admins: AdminLists, chats: readonly ChatId[], read: Read, now: () => number, log: (line: string) => void): Promise<void> {
  await Promise.all(
    chats.map(async (chat) => {
      const known = await read(async () => ((await admins.load(chat, now())) ? true : null));
      if (!known) log(`community group ${chat}: its admin list can't be read yet; until it is, only protective deletes act there, and it is read again every 30 seconds`);
    }),
  );
}

/** The bot's own rights in each group, as last read, for /status: null when Telegram couldn't say. */
export function botRightsOf(admins: AdminLists): { get(chat: ChatId): { delete: boolean; restrict: boolean } | null; read(chats: readonly ChatId[]): Promise<void> } {
  const rights = new Map<ChatId, { delete: boolean; restrict: boolean } | null>();
  return {
    get: (chat) => rights.get(chat) ?? null,
    async read(chats) {
      for (const chat of chats) rights.set(chat, await admins.botRights(chat).catch(() => null));
    },
  };
}
