import type { SendKind } from "./out";
import type { ChatId } from "./types";

const WINDOW_MS = 60_000;
/** A group's sends and edits in a minute: Telegram lets a bot post about 20 a minute in a group. */
export const GROUP_BUDGET = 20;

/** What takes a slot: a send of one kind, an edit of a check message, or an extra (an ephemeral copy of a notice). */
export type SlotKind = SendKind | "edit" | "extra";

/**
 * How much of a group's minute each kind may use, so a busy minute drops
 * extras first, check edits and answers next and notices after them, and
 * always keeps room for checks: extras stop at 10, edits and answers at 14,
 * notices at 18. Checks (and alerts, in the admin chat) may use the whole
 * minute, and wait for a slot once it is full; an edit never waits, so a
 * check's send is never held up behind its edits.
 */
const SHARE: Readonly<Record<SlotKind, number>> = { extra: 10, edit: 14, answer: 14, notice: 18, check: GROUP_BUDGET, alert: GROUP_BUDGET };
/** Kinds that wait for a slot instead of being dropped. */
const WAITS: ReadonlySet<SlotKind> = new Set<SlotKind>(["check", "alert"]);

/** Each group's minute of sends and edits, shared by the kinds (community/telegram-out.ts). */
export interface GroupBudget {
  /**
   * Takes a slot for one send or edit: when it may go out (now, or later
   * for a check or an alert waiting for the minute to free up), or null
   * when it is dropped (an extra, answer or notice past its share, or a wait
   * longer than `maxWaitMs`).
   */
  take(chat: ChatId, kind: SlotKind, now: number, maxWaitMs: number): number | null;
  /** Gives a slot back: what took it wasn't sent. */
  release(chat: ChatId, at: number): void;
  /** Whether a send of this kind would get a slot now, without waiting. */
  room(chat: ChatId, kind: SlotKind, now: number): boolean;
  /** Forgets slots older than a minute, and groups with none. */
  prune(now: number): void;
}

export function createGroupBudget(): GroupBudget {
  const slots = new Map<ChatId, number[]>();

  /** The group's slots still counting at `now`, oldest first: the last minute's, and those taken ahead by waiting checks. */
  function live(chat: ChatId, now: number): number[] {
    const kept = (slots.get(chat) ?? []).filter((at) => at > now - WINDOW_MS);
    if (kept.length > 0) slots.set(chat, kept);
    else slots.delete(chat);
    return kept;
  }

  return {
    take(chat, kind, now, maxWaitMs) {
      const used = live(chat, now);
      let at = now;
      if (used.length >= SHARE[kind]) {
        if (!WAITS.has(kind)) return null;
        // The first moment the minute before it holds fewer than GROUP_BUDGET of the others.
        at = Math.max(now, used[used.length - GROUP_BUDGET] + WINDOW_MS);
        if (at - now > maxWaitMs) return null;
      }
      slots.set(chat, [...used, at].sort((a, b) => a - b));
      return at;
    },

    release(chat, at) {
      const used = slots.get(chat);
      const i = used?.indexOf(at) ?? -1;
      if (!used || i < 0) return;
      used.splice(i, 1);
      if (used.length === 0) slots.delete(chat);
    },

    room: (chat, kind, now) => live(chat, now).length < SHARE[kind],

    prune(now) {
      for (const chat of [...slots.keys()]) live(chat, now);
    },
  };
}
