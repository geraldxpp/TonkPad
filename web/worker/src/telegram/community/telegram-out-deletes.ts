import type { Sender } from "../sender";
import type { ChatId, Records } from "./types";

/** Deletes asked for within this time go out together, per chat. */
export const BATCH_MS = 300;
/** deleteMessages takes 1 to 100 IDs. */
const BATCH_MAX = 100;
/** A delete within this time also waits on a timer, so it is made on time between ticks. */
export const LATER_MAX_MS = 60_000;
/** A failed delete is tried again after 30 seconds, then twice as long each time, at most every 30 minutes. */
const RETRY_FIRST_MS = 30_000;
const RETRY_MAX_MS = 30 * 60_000;
/** Telegram lets a bot delete a message for 48 hours: past that, a failure's count is forgotten too. */
const TRIES_KEPT_MS = 48 * 60 * 60_000;

type Timer = ReturnType<typeof setTimeout>;

const validId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;
const validChat = (chat: unknown): chat is ChatId => typeof chat === "number" && Number.isSafeInteger(chat) && chat !== 0;
const keyOf = (chat: ChatId, id: number) => `${chat}:${id}`;

export interface Deletes {
  remove(chat: ChatId, messageIds: readonly number[]): void;
  removeLater(chat: ChatId, messageId: number, afterMs: number): void;
  /** Deletes what the records say is due: those from before a restart, and failed ones whose retry is due. */
  tick(now: number): void;
  /** Writes what is batched to the records as due now, and sends it too; short delays are already in the records. */
  stop(): void;
}

/**
 * Message deletes: batched per chat for 300 ms into deleteMessages (up to
 * 100 IDs a call, which skips messages already gone), sent with
 * sender.direct in the moderation lane (first of the shared 25 a second). Every delete is written to
 * the records before it is sent, due again at its retry time, and leaves
 * them only once deleteMessages returns true: a failed call (Telegram down,
 * a 502), a stop or a crash leaves it there, and tick() sends it again when
 * due, backing off from 30 seconds to 30 minutes, until the records' 48
 * hours (Telegram's limit for a bot) run out. A delete asked for later is
 * written at once with its due time; within a minute it also waits on a
 * timer that doesn't hold the process open. Nothing here throws.
 */
export function createDeletes(deps: { sender: Sender; records: Records; now: () => number }): Deletes {
  const { sender, records } = deps;
  const batches = new Map<ChatId, { ids: Set<number>; timer: Timer }>();
  const timers = new Set<Timer>();
  /** Failed tries per message, for the backoff (chat and message IDs only, never a user's). */
  const tries = new Map<string, { n: number; at: number }>();

  const retryAt = (chat: ChatId, id: number, at: number) => at + Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** Math.min(16, tries.get(keyOf(chat, id))?.n ?? 0));

  function settle(chat: ChatId, ids: readonly number[], done: boolean): void {
    const at = deps.now();
    for (const id of ids) {
      const key = keyOf(chat, id);
      if (done) {
        records.doneDelete(chat, id);
        tries.delete(key);
      } else {
        tries.set(key, { n: (tries.get(key)?.n ?? 0) + 1, at });
      }
    }
  }

  /** Sends one chat's batch; `due` sets when the records try it again (its retry time unless given). */
  function flush(chat: ChatId, due?: number): void {
    const batch = batches.get(chat);
    if (!batch) return;
    batches.delete(chat);
    clearTimeout(batch.timer);
    const ids = [...batch.ids];
    const at = deps.now();
    for (const id of ids) records.scheduleDelete(chat, id, due ?? retryAt(chat, id, at));
    for (let i = 0; i < ids.length; i += BATCH_MAX) {
      const part = ids.slice(i, i + BATCH_MAX);
      void sender
        .direct<boolean>("deleteMessages", { chat_id: chat, message_ids: part }, { priority: "act" })
        .then((result) => settle(chat, part, result === true), () => settle(chat, part, false));
    }
  }

  function remove(chat: ChatId, messageIds: readonly number[]): void {
    const ids = messageIds.filter(validId);
    if (!validChat(chat) || ids.length === 0) return;
    let batch = batches.get(chat);
    if (!batch) {
      const timer = setTimeout(() => flush(chat), BATCH_MS);
      timer.unref?.();
      batch = { ids: new Set<number>(), timer };
      batches.set(chat, batch);
    }
    for (const id of ids) batch.ids.add(id);
  }

  return {
    remove,

    removeLater(chat, messageId, afterMs) {
      if (!validChat(chat) || !validId(messageId)) return;
      const wait = Number.isFinite(afterMs) ? Math.max(0, afterMs) : 0;
      records.scheduleDelete(chat, messageId, deps.now() + wait);
      if (wait > LATER_MAX_MS) return;
      const timer = setTimeout(() => {
        timers.delete(timer);
        remove(chat, [messageId]);
      }, wait);
      timer.unref?.();
      timers.add(timer);
    },

    tick(now) {
      for (const { chat, messageId } of records.dueDeletes(now)) remove(chat, [messageId]);
      for (const [key, t] of tries) if (now - t.at >= TRIES_KEPT_MS) tries.delete(key);
    },

    stop() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      // Due at once: the next start deletes them if this send is cut off by the exit.
      const at = deps.now();
      for (const chat of [...batches.keys()]) flush(chat, at);
    },
  };
}
