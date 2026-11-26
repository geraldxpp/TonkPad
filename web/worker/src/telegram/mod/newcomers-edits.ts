import type { Locale } from "@/shared/i18n/config";
import type { CommunityOut } from "../community/out";
import type { ChatId, Records, Strictness } from "../community/types";
import type { CommunityDictionary } from "../community/words";
import { checkHtml, checkKeyboard, checkMs } from "./newcomers-view";

/**
 * A check message's edits. Nothing waits for them: a change only marks the
 * message, and at most one edit per message is under way, showing whoever is
 * pending as it is made; a change meanwhile makes one more edit after it,
 * with the state as it is then. Edits wait in a queue of their own, a group
 * gap apart, and never ahead of a check's send (community/telegram-out.ts),
 * so a join burst costs one edit every few seconds, not one per joiner, and
 * a busy minute skips them. Once nobody is left on it, the message is deleted.
 */

export interface EditsDeps {
  out: Pick<CommunityOut, "edit" | "remove">;
  records: Pick<Records, "pendingOn">;
  words: (lang: Locale) => CommunityDictionary;
  groupLang: Locale;
  strictness: (chat: ChatId) => Strictness;
  /** The time a check this process posted shows; null for one restored from the records. */
  durationOf: (chat: ChatId, messageId: number) => number | null;
  /** The message was deleted with its last newcomer: a later join opens a new check. */
  gone: (chat: ChatId, messageId: number) => void;
  log?: (line: string) => void;
}

/** Marks a check message to show who is pending on it now (or to go, with the last); returns at once. */
export type Refresh = (chat: ChatId, messageId: number) => void;

export function createCheckEdits(deps: EditsDeps): Refresh {
  const editing = new Map<string, { again: boolean }>();

  async function run(chat: ChatId, messageId: number, key: string, state: { again: boolean }): Promise<void> {
    try {
      do {
        state.again = false;
        const left = deps.records.pendingOn(chat, messageId);
        if (left.length === 0) {
          deps.out.remove(chat, [messageId]);
          deps.gone(chat, messageId);
          return;
        }
        const target = left[0].target;
        const durationMs = deps.durationOf(chat, messageId) ?? checkMs(deps.strictness(chat), target !== null);
        const d = deps.words(deps.groupLang);
        const html = checkHtml(left.map((p) => ({ id: p.user })), d, deps.groupLang, durationMs, target);
        // A failed edit (the group's minute full, or nothing changed) waits for the next change.
        await deps.out.edit(chat, messageId, html, checkKeyboard(d, target));
      } while (state.again);
    } finally {
      // As the last look is taken, not a moment later: a change after it starts a new edit.
      editing.delete(key);
    }
  }

  return (chat, messageId) => {
    const key = `${chat}:${messageId}`;
    const busy = editing.get(key);
    if (busy) {
      busy.again = true;
      return;
    }
    const state = { again: false };
    editing.set(key, state);
    void run(chat, messageId, key, state).catch(() => deps.log?.("a check message wasn't updated"));
  };
}
