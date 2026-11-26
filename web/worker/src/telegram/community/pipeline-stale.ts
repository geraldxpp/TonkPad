import { fillText } from "./controls-people";
import type { AlertSink, ChatId } from "./types";
import type { CommunityDictionary } from "./words";

/** The summary of stale deletes goes once none has come for this long. */
const STALE_QUIET_MS = 15_000;

/**
 * Messages deleted while catching up after downtime (split from
 * pipeline.ts): counted per group, and summed up in one alert per group
 * per restart, once none has come for 15 seconds. Counts only, no IDs.
 */
export function createStaleSummary(alerts: AlertSink, adminWords: CommunityDictionary) {
  const deletes = new Map<ChatId, number>();
  let lastAt = 0;
  let summarized = false;
  return {
    note(chat: ChatId, now: number): void {
      deletes.set(chat, (deletes.get(chat) ?? 0) + 1);
      lastAt = now;
    },

    summary(now: number): void {
      if (summarized || deletes.size === 0 || now - lastAt < STALE_QUIET_MS) return;
      summarized = true;
      for (const [chat, count] of deletes) {
        alerts.alert({
          chat, kind: "action", category: null, member: null, excerpt: null, link: null, done: fillText(adminWords.mod.summary, { count: String(count) }),
          aiGuess: null, undo: null, messageId: null, routine: true, urgent: false,
        });
      }
      deletes.clear();
    },
  };
}
