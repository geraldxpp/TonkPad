import type { Locale } from "@/shared/i18n/config";
import type { ChatId, Escalation } from "./types";

/**
 * What waits in memory for a member's press, and the short dedupes around
 * the bot's replies. A private chat's text waits for Ask, and an escalated
 * question for Share, at most 10 minutes (the privacy page's keeps.memory),
 * and at most 1,000 of them: past that, the oldest goes first. Each held
 * text expires on its own timer, so no tick that Telegram holds up can keep
 * it longer. Nothing here is saved.
 */

/** How long a held text waits for its press. */
export const HOLD_MS = 10 * 60_000;
const HOLD_MAX = 1_000;
/** A dedupe forgets its oldest keys past this many. */
const ONCE_MAX = 5_000;

/** A private chat's text, waiting for its Ask or Share press. */
export interface Held {
  text: string;
  lang: Locale;
  /** Why the team should see it (Share); "none" for a question waiting for Ask. */
  escalate: Escalation | "none";
  /** When it was held (ms). */
  at: number;
}

export interface Holds {
  put(chat: ChatId, messageId: number, entry: Held): void;
  /** The entry, removed, or null when there is none or it is 10 minutes old: each is taken once. */
  take(chat: ChatId, messageId: number, now: number): Held | null;
  prune(now: number): void;
}

const keyOf = (chat: ChatId, messageId: number) => `${chat}:${messageId}`;

/** Sets a key as the newest, forgetting the oldest past `max` (a Map keeps insertion order); `gone` hears of each key forgotten. */
function remember<V>(map: Map<string, V>, key: string, value: V, max: number, gone: (value: V) => void = () => undefined): void {
  const known = map.get(key);
  if (known !== undefined) gone(known);
  map.delete(key);
  map.set(key, value);
  for (const [oldest, old] of map) {
    if (map.size <= max) break;
    gone(old);
    map.delete(oldest);
  }
}

export function createHolds(): Holds {
  const held = new Map<string, { entry: Held; timer: ReturnType<typeof setTimeout> }>();
  const clear = (h: { timer: ReturnType<typeof setTimeout> }) => clearTimeout(h.timer);
  return {
    put(chat, messageId, entry) {
      const key = keyOf(chat, messageId);
      // Gone 10 minutes from now whatever else happens; the timer never holds the process open.
      const timer = setTimeout(() => {
        if (held.get(key)?.timer === timer) held.delete(key);
      }, HOLD_MS);
      timer.unref?.();
      remember(held, key, { entry: { ...entry }, timer }, HOLD_MAX, clear);
    },

    take(chat, messageId, now) {
      const key = keyOf(chat, messageId);
      const h = held.get(key);
      if (!h) return null;
      clear(h);
      held.delete(key);
      return now - h.entry.at < HOLD_MS ? h.entry : null;
    },

    prune(now) {
      for (const [key, h] of held) {
        if (now - h.entry.at < HOLD_MS) continue;
        clear(h);
        held.delete(key);
      }
    },
  };
}

/** True the first time a key is seen within its window: a reply that must not repeat (a paused note, the DM warning). */
export interface Once {
  first(key: string, now: number): boolean;
  /** Forgets keys whose window has passed, so no ID outlives it. */
  prune(now: number): void;
}

export function createOnce(windowMs: number): Once {
  const seen = new Map<string, number>();
  return {
    first(key, now) {
      const at = seen.get(key);
      if (at !== undefined && now - at < windowMs) return false;
      remember(seen, key, now, ONCE_MAX);
      return true;
    },

    prune(now) {
      for (const [key, at] of seen) if (now - at >= windowMs) seen.delete(key);
    },
  };
}
