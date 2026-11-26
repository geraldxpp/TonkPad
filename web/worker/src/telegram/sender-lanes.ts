export type Sleep = (ms: number) => Promise<void>;

/**
 * Which calls take Telegram's 25 a second first when there aren't enough
 * for all: moderation (restrict, ban, unban, remove, delete), then the reads
 * it decides by (a commenter's standing, the admin lists), then messages,
 * then reads that only double-check what was already done (a joiner's
 * restriction, read after the check restricted them), then cosmetic edits
 * (a check message naming who is left), and press answers last.
 */
export type Priority = "act" | "read" | "send" | "verify" | "edit" | "press";

const RANK: Readonly<Record<Priority, number>> = { act: 0, read: 1, send: 2, verify: 3, edit: 4, press: 5 };
const PER_SECOND = 25;
const WINDOW_MS = 1_000;

interface Waiter {
  rank: number;
  seq: number;
  deadline: number;
  take: (ok: boolean) => void;
}

/**
 * The second's 25 calls, shared by every call the Sender makes and handed
 * out by priority, first come first served within one: a call never waits
 * behind one of a lower priority, however many of those are waiting. A call
 * whose deadline passes while it waits leaves without a slot, so a press
 * answer Telegram would refuse anyway is never sent late. One loop serves
 * them, sleeping only until the oldest slot of the second frees up.
 */
export class Lanes {
  private recent: number[] = [];
  private readonly waiters: Waiter[] = [];
  private seq = 0;
  private serving = false;

  constructor(
    private readonly now: () => number,
    private readonly sleep: Sleep,
  ) {}

  /** Calls waiting for a slot. */
  get waiting(): number {
    return this.waiters.length;
  }

  /** Waits for a slot: true once it has one, false when `deadline` (ms) passes first. */
  slot(priority: Priority, deadline: number): Promise<boolean> {
    return new Promise((take) => {
      this.seq += 1;
      this.waiters.push({ rank: RANK[priority], seq: this.seq, deadline, take });
      void this.serve();
    });
  }

  private async serve(): Promise<void> {
    if (this.serving) return;
    this.serving = true;
    try {
      while (this.waiters.length > 0) {
        const now = this.now();
        this.expire(now);
        if (this.waiters.length === 0) break;
        this.recent = this.recent.filter((at) => now - at < WINDOW_MS);
        if (this.recent.length < PER_SECOND) {
          this.recent.push(now);
          this.best().take(true);
          continue;
        }
        // Until the oldest slot frees up, or the nearest deadline passes.
        const free = WINDOW_MS - (now - this.recent[0]);
        await this.sleep(Math.max(1, Math.min(free, this.soonest() - now + 1)));
      }
    } finally {
      this.serving = false;
    }
  }

  /** Lets go of the calls whose deadline has passed. */
  private expire(now: number): void {
    for (let i = this.waiters.length - 1; i >= 0; i -= 1) {
      if (this.waiters[i].deadline >= now) continue;
      const [late] = this.waiters.splice(i, 1);
      late.take(false);
    }
  }

  /** Takes out the waiter to serve next: the best priority, then the longest waiting. */
  private best(): Waiter {
    let pick = 0;
    for (let i = 1; i < this.waiters.length; i += 1) {
      const w = this.waiters[i];
      const p = this.waiters[pick];
      if (w.rank < p.rank || (w.rank === p.rank && w.seq < p.seq)) pick = i;
    }
    return this.waiters.splice(pick, 1)[0];
  }

  private soonest(): number {
    let at = Number.POSITIVE_INFINITY;
    for (const w of this.waiters) at = Math.min(at, w.deadline);
    return at;
  }
}
