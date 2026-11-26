/**
 * At most one use per key in a window, where asking must not use it up
 * (community/hold.ts Once uses its key as it asks): the DM warning sent
 * alone in a group, at most once every 2 minutes, by the group's ID only.
 */
export interface Gap {
  /** Whether the key is free now (nothing used within the window). */
  open(key: string, now: number): boolean;
  use(key: string, now: number): void;
  /** Forgets keys whose window has passed. */
  prune(now: number): void;
}

/** A gap forgets its oldest keys past this many. */
const GAP_MAX = 1_000;

export function createGap(windowMs: number): Gap {
  const last = new Map<string, number>();
  return {
    open(key, now) {
      const at = last.get(key);
      return at === undefined || now - at >= windowMs;
    },

    use(key, now) {
      last.delete(key);
      last.set(key, now);
      for (const oldest of last.keys()) {
        if (last.size <= GAP_MAX) break;
        last.delete(oldest);
      }
    },

    prune(now) {
      for (const [key, at] of last) if (now - at >= windowMs) last.delete(key);
    },
  };
}
