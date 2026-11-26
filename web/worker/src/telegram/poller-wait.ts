import type { TgUpdate } from "./types";

/** A priority update waits at most this long for a slot: past it, it is stale for moderation, and it holds a member's text. */
export const BUFFER_MS = 5 * 60_000;
/** An update held for release() (a community chat's, while the community agent starts) waits at most this long. */
export const HOLD_MS = 2 * 60_000;

/** An update waiting in memory, with when it arrived. */
interface Waiting {
  update: TgUpdate;
  at: number;
}

/**
 * What waits in the poller's memory (poller.ts), oldest first: priority
 * updates waiting for a slot (5 minutes at most), and updates held until
 * release() (2 minutes at most). Both hold members' text, so prune() drops
 * what waited past its time and clear() empties both.
 */
export class WaitingUpdates {
  private readonly slot: Waiting[] = [];
  private readonly held: Waiting[] = [];

  /** Priority updates waiting for a slot. */
  get buffered(): number {
    return this.slot.length;
  }

  /** Updates held for release(). */
  get holding(): number {
    return this.held.length;
  }

  forSlot(update: TgUpdate, at: number): void {
    this.slot.push({ update, at });
  }

  hold(update: TgUpdate, at: number): void {
    this.held.push({ update, at });
  }

  /** The oldest update waiting for a slot, or undefined. */
  next(): TgUpdate | undefined {
    return this.slot.shift()?.update;
  }

  /** Every held update, oldest first, and none held after. */
  takeHeld(): TgUpdate[] {
    return this.held.splice(0).map((w) => w.update);
  }

  /** Drops what waited past its time: 5 minutes for a slot, 2 held. How many went. */
  prune(now: number): number {
    let stale = 0;
    for (const [list, limit] of [[this.slot, BUFFER_MS], [this.held, HOLD_MS]] as const) {
      while (list.length > 0 && now - list[0].at >= limit) {
        list.shift();
        stale += 1;
      }
    }
    return stale;
  }

  /** Empties both; how many were lost. */
  clear(): number {
    const lost = this.slot.length + this.held.length;
    this.slot.length = 0;
    this.held.length = 0;
    return lost;
  }
}
