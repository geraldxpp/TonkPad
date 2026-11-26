import { GROUP_GAP, type Sender } from "../sender";
import type { GroupBudget } from "./telegram-out-budget";
import type { ChatId, UserId } from "./types";

const HOUR = 3_600_000;
/** Copies waiting in a group's own queue for them; past that one is skipped. */
const QUEUED = 6;
const MAX_WAIT_MS = 20_000;
const TIMEOUT_MS = 10_000;
/** After this many refused in a row (Telegram may not take them in a group), copies pause for an hour, so the log isn't flooded. */
const FAILS = 3;

export interface Ephemeral {
  /** Sends a group message's copy that only `user` sees, if the group's minute is quiet. Never awaited, never relied on. */
  copy(chat: ChatId, params: Record<string, unknown>, user: UserId): void;
}

/**
 * Ephemeral copies (sendMessage with ephemeral_message_parameters): the
 * same text shown to one member alone, as an extra beside a group message.
 * Best effort: each takes an "extra" slot of the group's minute (only while
 * it is quiet), waits in its own queue (`<chat>:ephemeral`), and a refusal
 * (a 400) changes nothing else.
 */
export function createEphemeral(deps: { sender: Sender; budget: GroupBudget; log: (line: string) => void; now: () => number }): Ephemeral {
  const { sender, budget } = deps;
  let fails = 0;
  let pausedUntil = 0;

  function settled(chat: ChatId, slot: number, sent: unknown): void {
    if (sent !== null) {
      fails = 0;
      return;
    }
    budget.release(chat, slot);
    fails += 1;
    if (fails < FAILS) return;
    fails = 0;
    pausedUntil = deps.now() + HOUR;
    deps.log(`ephemeral copies were refused ${FAILS} times in a row: paused for an hour`);
  }

  return {
    copy(chat, params, user) {
      const now = deps.now();
      const key = `${chat}:ephemeral`;
      if (!Number.isSafeInteger(user) || user <= 0 || now < pausedUntil || sender.waiting(key) >= QUEUED) return;
      const slot = budget.take(chat, "extra", now, 0);
      if (slot === null) return;
      const message = { ...params, ephemeral_message_parameters: { receiver_user_id: user } };
      void sender
        .toChat(key, GROUP_GAP, "sendMessage", message, { maxQueued: QUEUED, maxWaitMs: MAX_WAIT_MS, timeoutMs: TIMEOUT_MS })
        .then((sent) => settled(chat, slot, sent))
        .catch(() => undefined);
    },
  };
}
