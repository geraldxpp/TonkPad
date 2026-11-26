import type { TriageJob } from "./pipeline-triage";
import type { ChatId } from "./types";

/**
 * Checks that wait for their turn (prompts/15-community-agent.md, Per-user
 * and per-chat limits), in memory only: an edit made within a minute of its
 * message's last check waits until that minute ends, and a message past its
 * member's 3 checks a minute waits until one comes back, within the check's
 * own 60 seconds. One per message: a later version replaces it, and the
 * message's removal drops it. Each holds its message no longer than its
 * minute and the tick after it (5 seconds), well within the privacy page's
 * 10 minutes.
 */

export interface Waiting {
  job: TriageJob;
  /** The fingerprint of the version it holds (pipeline-triage-pace.ts printOf). */
  print: string;
  /** When it may run (ms). */
  at: number;
  /** "edit": read again in full once its message's minute ends; "turn": queued once its member has a check back, by `deadline`. */
  kind: "edit" | "turn";
  /** The last moment a "turn" may start (ms): the message's own 60 seconds. */
  deadline: number;
}

/** Bounds, so a raid can't grow the list between ticks: past it, a check falls back to the rules at once. */
const MAX_WAITING = 2_000;

export const waitKey = (chat: ChatId, messageId: number): string => `${chat}:${messageId}`;

export function createWaiting() {
  const waiting = new Map<string, Waiting>();
  return {
    get: (key: string): Waiting | undefined => waiting.get(key),

    /** Holds one message's check, replacing any it had; false when the list is full (the caller falls back). */
    put(key: string, entry: Waiting): boolean {
      waiting.delete(key);
      if (waiting.size >= MAX_WAITING) return false;
      waiting.set(key, entry);
      return true;
    },

    drop(key: string): void {
      waiting.delete(key);
    },

    /** Takes every check whose time has come, earliest first. */
    take(now: number): Waiting[] {
      const due = [...waiting.entries()].filter(([, w]) => w.at <= now).sort((a, b) => a[1].at - b[1].at);
      for (const [key] of due) waiting.delete(key);
      return due.map(([, w]) => w);
    },

    size: (): number => waiting.size,
  };
}
