/** How long an answer from Telegram is used again: the privacy page lets the bot hold IDs for 10 minutes. */
export const CACHE_MS = 10 * 60_000;
/** Answers kept at most; past this the oldest goes first. */
const MAX_ENTRIES = 5_000;

export interface Cache<T> {
  /**
   * The answer Telegram gave less than 10 minutes ago (counted from when it
   * was asked), or a new one from `load`; callers asking at the same time
   * share one request. A null answer (a failed read) isn't kept.
   */
  get(key: string, load: () => Promise<T | null>): Promise<T | null>;
  /** Forgets an answer, and any read under way, so the next get asks again: what it said may have changed. */
  drop(key: string): void;
  /** Forgets answers 10 minutes old. */
  prune(now: number): void;
}

/**
 * A small read cache for getChatMember, getChat and getChatMemberCount
 * (community/telegram-out.ts). An answer `keep` refuses is handed out but
 * not kept, so the next get asks Telegram again.
 */
export function createCache<T>(now: () => number, keep: (value: T) => boolean = () => true): Cache<T> {
  const values = new Map<string, { at: number; value: T }>();
  const reads = new Map<string, Promise<T | null>>();

  function store(key: string, at: number, value: T): void {
    // Set again at the end, so the map stays oldest first for the cap.
    values.delete(key);
    values.set(key, { at, value });
    if (values.size <= MAX_ENTRIES) return;
    const oldest = values.keys().next();
    if (!oldest.done) values.delete(oldest.value);
  }

  return {
    get(key, load) {
      const hit = values.get(key);
      if (hit && now() - hit.at < CACHE_MS) return Promise.resolve(hit.value);
      const running = reads.get(key);
      if (running) return running;
      const asked = now();
      const read: Promise<T | null> = load()
        .catch(() => null)
        .then((value) => {
          // Dropped while it was under way: an answer from before the change isn't kept.
          if (reads.get(key) !== read) return value;
          reads.delete(key);
          if (value !== null && keep(value)) store(key, asked, value);
          return value;
        });
      reads.set(key, read);
      return read;
    },

    drop(key) {
      values.delete(key);
      reads.delete(key);
    },

    prune(at) {
      for (const [key, entry] of values) if (at - entry.at >= CACHE_MS) values.delete(key);
    },
  };
}
