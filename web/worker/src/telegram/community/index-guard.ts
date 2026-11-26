import type { ChatId, ChatSettings, Records } from "./types";

/**
 * Records as the parts that act on people read them (index-build.ts:
 * moderation, Haiku's checks, new members, raid mode). While Telegram
 * hasn't confirmed a group's admin list, nobody there is known to be an
 * admin, so the group is moderated as in observe mode
 * (prompts/15-community-agent.md, Who's who): only protective deletes
 * (secrets, look-alike and drainer links), everything else reported to the
 * admins, and no offence, mute, ban, new-member check or notice. The saved
 * strictness is untouched (/status and the controls show it), and applies
 * again as soon as the list is read.
 */
export function guardedRecords(records: Records, unconfirmed: (chat: ChatId) => boolean): Records {
  const settings = (chat: ChatId): ChatSettings => {
    const saved = records.settings(chat);
    return saved.strictness !== "observe" && unconfirmed(chat) ? { ...saved, strictness: "observe" } : saved;
  };
  return { ...records, settings };
}

/** A part that ends one group's work when it is dropped: newcomers.dropChat and raid.dropChat (mod/newcomers.ts, mod/raid.ts). */
interface Droppable {
  dropChat(chat: ChatId): unknown;
}

/**
 * A group dropped after start (its setup check failed for certain): its
 * pending new-member checks end without punishment and its raid watch goes,
 * through each part's dropChat, each on its own: a failure is logged by the
 * group's ID only, never reaches the caller, and never stops the next part.
 */
export function endGroup(parts: readonly Droppable[], chat: ChatId, log: (line: string) => void): void {
  for (const part of parts) {
    try {
      const done = part.dropChat(chat);
      if (done instanceof Promise) done.catch(() => log(`community group ${chat}: its checks didn't all end`));
    } catch {
      log(`community group ${chat}: its checks didn't all end`);
    }
  }
}
