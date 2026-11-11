import type { TrackedToken } from "../model";
import { GeckoRateLimitError, type PoolRequest, type RawCandle, type Resolution } from "../sources/geckoterminal";
import { chartPools, MAX_MINUTES, mergeMinutes, type PoolHistory } from "./pools";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
/** GeckoTerminal calls a minute, below the ~6 it allowed in testing so a 429 stays rare. */
const CALLS_PER_MINUTE = 5;
const BURST = 2;
/** A pool counts as open while a page asked for it this recently (pages poll every 4 s). */
const OPEN_FOR = 30 * SECOND;
const REFRESH_EVERY = MINUTE;
const HOUR_REFRESH_EVERY = 15 * MINUTE;
/** Every call waits this long after a 429. */
const RATE_LIMIT_PAUSE = MINUTE;
/** A pool GeckoTerminal hasn't indexed yet, or a failed call, is tried again after this. */
const RETRY_AFTER = 30 * SECOND;
/** A curve is read once more this long after its token graduates, when its last trades have landed. */
const SETTLE = 2 * MINUTE;
const FORGET_AFTER = 30 * MINUTE;
const MAX_POOLS = 100;

export type FetchCandles = (request: PoolRequest, resolution: Resolution, limit: number) => Promise<RawCandle[] | null>;

interface Entry {
  request: PoolRequest;
  /** For a curve its token left: when it graduated, ms. Its candles stop changing then. */
  frozenSince: number | null;
  /** The token's launch, ms: how far back hour candles must reach. */
  since: number;
  history: PoolHistory | null;
  hourFetchedAt: number;
  retryAt: number;
  openedAt: number;
}

interface Job {
  entry: Entry;
  resolution: Resolution;
  limit: number;
  /** Lower runs first. */
  rank: [number, number];
}

/**
 * Candles for the pools of tokens people have open, fetched from GeckoTerminal
 * within its free budget: a new pool first, then refreshes once a minute,
 * stalest first. Pools nobody looks at are forgotten after half an hour.
 */
export class ChartBook {
  private readonly entries = new Map<string, Entry>();
  private budget = BURST;
  private budgetAt = 0;
  private pausedUntil = 0;
  private inflight: { pool: string; done: Promise<void> } | null = null;
  private readonly counts = { calls: 0, rateLimited: 0, missing: 0, failed: 0 };

  constructor(
    private readonly fetchCandles: FetchCandles,
    private readonly onError: (error: unknown) => void = () => {},
    private readonly now: () => number = Date.now,
  ) {}

  history(request: PoolRequest): PoolHistory | undefined {
    return this.entries.get(request.pool)?.history ?? undefined;
  }

  /** Marks a token's pools open; waits up to `waitMs` for its main pool's first candles. */
  async open(token: TrackedToken, waitMs: number): Promise<void> {
    const now = this.now();
    const { main, curve } = chartPools(token);
    if (curve) this.touch(curve, token, now - 1, token.graduatedAt ?? now);
    if (!main) return;
    if (this.touch(main, token, now, null).history) return;
    void this.tick();
    const pending = this.inflight;
    if (pending?.pool !== main.pool) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([pending.done, new Promise<void>((resolve) => { timer = setTimeout(resolve, waitMs); })]);
    clearTimeout(timer);
  }

  /** Starts the most urgent fetch the budget allows (one at a time); the worker calls it every second. */
  tick(): Promise<void> {
    if (this.inflight) return this.inflight.done;
    const now = this.now();
    this.forget(now);
    const job = this.nextJob(now);
    if (!job || !this.spend(now)) return Promise.resolve();
    const done = this.run(job).finally(() => {
      this.inflight = null;
    });
    this.inflight = { pool: job.entry.request.pool, done };
    return done;
  }

  stats() {
    return { ...this.counts, pools: this.entries.size, pausedUntil: this.pausedUntil };
  }

  private touch(request: PoolRequest, token: TrackedToken, now: number, frozenSince: number | null): Entry {
    const entry = this.entries.get(request.pool) ?? {
      request, frozenSince, since: token.createdAt, history: null, hourFetchedAt: 0, retryAt: 0, openedAt: now,
    };
    entry.frozenSince = frozenSince;
    entry.openedAt = now;
    // Re-inserting keeps the map in least-recently-opened order.
    this.entries.delete(request.pool);
    this.entries.set(request.pool, entry);
    return entry;
  }

  private forget(now: number): void {
    for (const [pool, entry] of this.entries) {
      if (now - entry.openedAt > FORGET_AFTER || this.entries.size > MAX_POOLS) this.entries.delete(pool);
    }
  }

  private jobFor(entry: Entry, now: number): Job | null {
    const h = entry.history;
    const minute = (rank: [number, number], limit = MAX_MINUTES): Job => ({ entry, resolution: "minute", limit, rank });
    if (!h) return minute([entry.frozenSince === null ? 0 : 1, -entry.openedAt]);
    if (entry.frozenSince !== null) return h.fetchedAt < entry.frozenSince + SETTLE && now >= entry.frozenSince + SETTLE ? minute([2, h.fetchedAt]) : null;
    const hour = (rank: number): Job => ({ entry, resolution: "hour", limit: Math.min(1_000, Math.ceil((now - entry.since) / HOUR) + 2), rank: [rank, entry.hourFetchedAt] });
    const hourDue = !h.minuteComplete && (!h.hour || now - entry.hourFetchedAt >= HOUR_REFRESH_EVERY);
    if (hourDue && !h.hour) return hour(1);
    // Asking for a couple of minutes more than have passed re-reads the minute that was still open.
    if (now - h.fetchedAt >= REFRESH_EVERY) return minute([2, h.fetchedAt], Math.min(MAX_MINUTES, Math.ceil((now - h.fetchedAt) / MINUTE) + 2));
    return hourDue ? hour(3) : null;
  }

  private nextJob(now: number): Job | null {
    let best: Job | null = null;
    for (const entry of this.entries.values()) {
      if (now - entry.openedAt > OPEN_FOR || entry.retryAt > now) continue;
      const job = this.jobFor(entry, now);
      if (job && (!best || job.rank[0] < best.rank[0] || (job.rank[0] === best.rank[0] && job.rank[1] < best.rank[1]))) best = job;
    }
    return best;
  }

  /** A token bucket: CALLS_PER_MINUTE, BURST at once, nothing while paused after a 429. */
  private spend(now: number): boolean {
    if (now < this.pausedUntil) return false;
    this.budget = Math.min(BURST, this.budget + ((now - this.budgetAt) / MINUTE) * CALLS_PER_MINUTE);
    this.budgetAt = now;
    if (this.budget < 1) return false;
    this.budget -= 1;
    return true;
  }

  private async run({ entry, resolution, limit }: Job): Promise<void> {
    this.counts.calls += 1;
    try {
      const rows = await this.fetchCandles(entry.request, resolution, limit);
      const at = this.now();
      if (rows === null) {
        this.counts.missing += 1;
        entry.retryAt = at + RETRY_AFTER;
      } else if (resolution === "hour" && entry.history) {
        entry.history = { ...entry.history, hour: rows, hourComplete: rows.length < limit };
        entry.hourFetchedAt = at;
      } else entry.history = mergeMinutes(entry.history, rows, limit, at);
    } catch (error) {
      if (error instanceof GeckoRateLimitError) {
        this.counts.rateLimited += 1;
        this.pausedUntil = this.now() + RATE_LIMIT_PAUSE;
        this.budget = 0;
      } else {
        this.counts.failed += 1;
        entry.retryAt = this.now() + RETRY_AFTER;
      }
      this.onError(error);
    }
  }
}
