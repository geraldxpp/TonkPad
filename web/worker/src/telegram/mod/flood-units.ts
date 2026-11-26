/**
 * How a member's messages count toward the flood limit (flood.ts): each
 * message once in the last minute, whatever edits it gets (an edit only
 * refreshes its time), and an album or one second's forwards as one message
 * for every 5 of them (an album of 8 counts 2, 21 forwards 5). The raw caps
 * (twice the limit in 10 seconds, four times in a minute) count every
 * message, however grouped.
 */

/** One message as the flood limits read it. */
export interface Post {
  messageId: number;
  /** When it came, or was last edited. */
  at: number;
  sticker: string | null;
  /** What makes it one with others: an album, or a forward's second; null counts alone. */
  unit: string | null;
}

/** How long the window holds a message: the raw cap reads a minute. */
const WINDOW_MS = 60_000;
/** At most this many messages a member: past four times the relaxed limit, with room. */
const WINDOW_MAX = 64;
/** An album or a forward burst counts one message for every this many. */
const PER_UNIT = 5;

/** How many messages the posts count as: alone, one each; an album or a forward burst, one for every 5. */
export function units(posts: readonly Post[]): number {
  const groups = new Map<string, number>();
  let n = 0;
  for (const { unit } of posts) {
    if (unit === null) n += 1;
    else groups.set(unit, (groups.get(unit) ?? 0) + 1);
  }
  for (const size of groups.values()) n += Math.ceil(size / PER_UNIT);
  return n;
}

/**
 * The last minute's posts with `post` noted: a new message added, one
 * already there refreshed to `post.at` (an edit, or the same message noted
 * again), and an edit of one that isn't there (the watch never saw it, or
 * over a minute ago) left out, so an edit never adds a message.
 */
export function windowOf(window: readonly Post[], now: number, post?: Post, edit = false): Post[] {
  const kept = window.filter((p) => now - p.at < WINDOW_MS);
  if (!post) return kept;
  const i = kept.findIndex((p) => p.messageId === post.messageId);
  if (i >= 0) return kept.map((p, j) => (j === i ? { ...p, at: post.at } : p));
  return edit ? kept : [...kept, post].slice(-WINDOW_MAX);
}
