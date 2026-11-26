import type { CommunityOut } from "../community/out";
import type { ChatId } from "../community/types";

/**
 * The slow work behind a message (answers and Haiku's checks), off the
 * update loop (prompts/15-community-agent.md, Slow model calls): a few jobs
 * at once, at most `perKey` at a time per key (a chat; one unless given),
 * in order, a short line behind them, and a deadline past which a job that
 * hasn't started is dropped rather than run late (its caller told, when it
 * asked to be). A waiting job holds its message's text, so it never waits
 * long.
 */

export interface JobQueueOptions {
  /** Jobs running at once, across keys. */
  concurrency: number;
  /** Jobs of one key running at once: 1 unless given (the answers' queue takes claude/limits.ts ANSWERS_AT_ONCE). */
  perKey?: number;
  /** Jobs that may wait; past that, push() refuses a new one. */
  maxPending: number;
  /** The clock deadlines are read on (ms): pass the caller's own, so both agree. Date.now unless given. */
  now?: () => number;
  /** A job that threw or rejected. Jobs handle their own errors; never log the error's text, which may hold a member's words. */
  onError?: (error: unknown) => void;
}

interface Job {
  key: string;
  deadline: number;
  run: () => Promise<void>;
  /** Told when the job is dropped past its deadline, so its caller can fall back (relaxed mode holds a link Haiku never judged). */
  onDropped?: () => void;
}

export class JobQueue {
  private readonly waiting: Job[] = [];
  /** Jobs running now, by key. */
  private readonly busy = new Map<string, number>();
  private readonly concurrency: number;
  private readonly perKey: number;
  private readonly maxPending: number;
  private readonly now: () => number;
  private running = 0;
  private dropped = 0;

  constructor(private readonly options: JobQueueOptions) {
    this.concurrency = Math.max(1, Math.floor(options.concurrency));
    this.perKey = Number.isFinite(options.perKey) ? Math.max(1, Math.floor(options.perKey ?? 1)) : 1;
    this.maxPending = Math.max(0, Math.floor(options.maxPending));
    this.now = options.now ?? Date.now;
  }

  /**
   * Runs `run` once a slot is free and its key has room, behind any job of
   * that key already waiting, unless `deadline` (ms on the queue's clock)
   * has passed by then: such a job is dropped, counted, and its `onDropped`
   * told (never `run`). False when the line is full: the caller falls back
   * (rules only, a skipped answer, a "busy" note), and `onDropped` is never
   * called.
   */
  push(key: string, deadline: number, run: () => Promise<void>, onDropped?: () => void): boolean {
    this.prune();
    const job: Job = { key, deadline, run, onDropped };
    if (this.running < this.concurrency && this.free(key) && !this.waiting.some((j) => j.key === key)) {
      this.begin(job);
      return true;
    }
    if (this.waiting.length >= this.maxPending) return false;
    this.waiting.push(job);
    return true;
  }

  /** Running and waiting jobs now, and how many were dropped past their deadline since the start. */
  stats(): { running: number; waiting: number; dropped: number } {
    return { running: this.running, waiting: this.waiting.length, dropped: this.dropped };
  }

  /** Drops waiting jobs past their deadline (and the text they hold); push() and each finished job do this too, and a caller's tick may. */
  prune(): void {
    for (let i = this.waiting.length - 1; i >= 0; i -= 1) {
      const job = this.waiting[i];
      if (!this.late(job)) continue;
      this.waiting.splice(i, 1);
      this.drop(job);
    }
  }

  /** Counts a dropped job and tells its caller; a handler that throws changes nothing here. */
  private drop(job: Job): void {
    this.dropped += 1;
    try {
      job.onDropped?.();
    } catch (error: unknown) {
      try {
        this.options.onError?.(error);
      } catch {
        // Nothing a handler does may stop the queue.
      }
    }
  }

  /** Past its deadline (a deadline that isn't a number counts as past). */
  private late(job: Job): boolean {
    return !(this.now() <= job.deadline);
  }

  /** Whether one more job of this key may run now. */
  private free(key: string): boolean {
    return (this.busy.get(key) ?? 0) < this.perKey;
  }

  private begin(job: Job): void {
    if (this.late(job)) {
      this.drop(job);
      return;
    }
    this.running += 1;
    this.busy.set(job.key, (this.busy.get(job.key) ?? 0) + 1);
    void Promise.resolve()
      .then(() => job.run())
      .catch((error: unknown) => this.options.onError?.(error))
      .catch(() => undefined)
      .then(() => {
        this.running -= 1;
        const left = (this.busy.get(job.key) ?? 1) - 1;
        if (left > 0) this.busy.set(job.key, left);
        else this.busy.delete(job.key);
        this.next();
      });
  }

  /** Starts waiting jobs, in order, whose key has room, while slots are. */
  private next(): void {
    this.prune();
    for (let i = 0; i < this.waiting.length && this.running < this.concurrency; ) {
      const job = this.waiting[i];
      if (!this.free(job.key)) {
        i += 1;
        continue;
      }
      this.waiting.splice(i, 1);
      this.begin(job);
    }
  }
}

/** Telegram shows "typing…" for at most 5 seconds, so it is sent again every 4. */
export const TYPING_EVERY_MS = 4_000;
/** At most 12 beats unless given: 48 seconds, past Haiku 5.5's 45-second answer deadline. */
export const TYPING_MAX_BEATS = 12;
/** Enough beats to run past an answer's deadline (agent/answer-request.ts): 12 for 45 seconds, 16 (64 seconds) for 60. */
export const typingBeats = (deadlineMs: number): number =>
  Number.isFinite(deadlineMs) && deadlineMs > 0 ? Math.floor(deadlineMs / TYPING_EVERY_MS) + 1 : TYPING_MAX_BEATS;

/**
 * Shows "typing…" in the chat (and topic) while `work` runs: at once, then
 * every 4 seconds, at most 12 times (or `maxBeats`), stopping as soon as the work settles.
 * Typing is a courtesy: its failures never touch the work, whose own result
 * or error comes back unchanged.
 */
export async function withTyping<T>(
  out: CommunityOut,
  chat: ChatId,
  thread: number | undefined,
  work: () => Promise<T>,
  options: { everyMs?: number; maxBeats?: number } = {},
): Promise<T> {
  const everyMs = options.everyMs ?? TYPING_EVERY_MS;
  const maxBeats = options.maxBeats ?? TYPING_MAX_BEATS;
  let beats = 0;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const beat = (): void => {
    if (settled || beats >= maxBeats) return;
    beats += 1;
    try {
      out.typing(chat, thread).catch(() => undefined);
    } catch {
      // Typing is best effort.
    }
    if (beats < maxBeats) timer = setTimeout(beat, everyMs);
  };
  beat();
  try {
    return await work();
  } finally {
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
  }
}
