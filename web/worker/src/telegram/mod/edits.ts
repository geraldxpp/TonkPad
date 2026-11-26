import type { ChatId } from "../community/types";

/** How long a message's link keys are remembered (the privacy page: "had links" per message, 10 minutes). */
const KEEP_MS = 600_000;
/** A bound, so a busy group can't grow the map without end between prunes. */
const MAX = 20_000;

/**
 * Which link keys (Markers.linkKeys: unknown links, handles, addresses) each
 * message had, in memory for 10 minutes from when it was sent, so an edit
 * that adds one can be told from an edit that keeps it. Message IDs and keys
 * only: no text, no user IDs.
 */
export class EditMemory {
  private readonly seen = new Map<string, { keys: Set<string>; at: number }>();

  /** Notes a message's keys; noting it again only adds keys, and keeps its time. */
  remember(chat: ChatId, messageId: number, keys: readonly string[], now: number): void {
    const id = `${chat}:${messageId}`;
    const record = this.seen.get(id);
    if (record && now - record.at < KEEP_MS) {
      for (const key of keys) record.keys.add(key);
      return;
    }
    this.seen.delete(id);
    this.seen.set(id, { keys: new Set(keys), at: now });
    if (this.seen.size > MAX) this.prune(now);
    for (const old of this.seen.keys()) {
      if (this.seen.size <= MAX) break;
      this.seen.delete(old);
    }
  }

  /**
   * Whether an edit added a key the message didn't have: null when there is
   * no record (the bot never saw it, or more than 10 minutes ago). The new
   * keys are remembered, so editing again without adding one is false.
   */
  added(chat: ChatId, messageId: number, keysNow: readonly string[], now: number): boolean | null {
    const record = this.seen.get(`${chat}:${messageId}`);
    if (!record || now - record.at >= KEEP_MS) return null;
    const added = keysNow.some((key) => !record.keys.has(key));
    for (const key of keysNow) record.keys.add(key);
    return added;
  }

  /** Forgets every record older than 10 minutes. */
  prune(now: number): void {
    for (const [id, record] of this.seen) if (now - record.at >= KEEP_MS) this.seen.delete(id);
  }
}
