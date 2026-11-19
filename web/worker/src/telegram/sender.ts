import { type BotApi, TelegramError } from "./api";

/** Between two messages to one chat: a person's chat about one a second; a group or the channel 20 a minute. */
export const PRIVATE_GAP = 1_000;
export const GROUP_GAP = 3_000;
const PER_SECOND = 25;
const RETRIES = 3;

export type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A refreshed card that didn't change, or a button press answered too late: nothing to report. */
const HARMLESS = /message is not modified|query is too old|query ID is invalid/i;

/**
 * Sends Bot API calls inside Telegram's limits: in order per chat, a gap
 * apart, at most 25 a second overall. A 429 waits Telegram's retry_after; a
 * dropped connection is tried once more, except for a new message, which
 * Telegram may already have taken (a repeat would post it twice); anything
 * else (403 blocked or removed, 400) is counted, logged with Telegram's own
 * words and dropped. A chat may cap how many of its calls wait in line: past
 * that, a reply is dropped at once rather than left waiting for minutes.
 */
export class Sender {
  readonly stats = { calls: 0, failed: 0, dropped: 0, lastError: "" };
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly pending = new Map<string, number>();
  private readonly lastAt = new Map<string, number>();
  private recent: number[] = [];

  constructor(
    private readonly api: BotApi,
    private readonly log: (line: string) => void,
    private readonly now: () => number = Date.now,
    private readonly sleep: Sleep = realSleep,
  ) {}

  /** A call that isn't a message (answering a button press or an inline query): no per-chat gap. */
  direct<T>(method: string, params: Record<string, unknown>): Promise<T | null> {
    return this.attempt<T>(method, params);
  }

  /** A message or an edit for one chat, queued behind that chat's earlier ones; null at once when `maxQueued` already wait. */
  toChat<T>(chat: string, gap: number, method: string, params: Record<string, unknown>, maxQueued = Number.POSITIVE_INFINITY): Promise<T | null> {
    const waiting = this.pending.get(chat) ?? 0;
    if (waiting >= maxQueued) {
      this.stats.dropped += 1;
      return Promise.resolve(null);
    }
    this.pending.set(chat, waiting + 1);
    const previous = this.queues.get(chat) ?? Promise.resolve();
    const run = previous.then(async () => {
      const wait = (this.lastAt.get(chat) ?? 0) + gap - this.now();
      if (wait > 0) await this.sleep(wait);
      try {
        return await this.attempt<T>(method, params);
      } finally {
        this.lastAt.set(chat, this.now());
      }
    });
    const settled = run.catch(() => null);
    this.queues.set(chat, settled);
    void settled.then(() => {
      const left = (this.pending.get(chat) ?? 1) - 1;
      if (left > 0) this.pending.set(chat, left);
      else this.pending.delete(chat);
      if (this.queues.get(chat) === settled) this.queues.delete(chat);
      if (this.lastAt.size > 5_000) this.forgetIdle();
    });
    return settled;
  }

  private forgetIdle(): void {
    const cutoff = this.now() - 60_000;
    for (const [chat, at] of this.lastAt) if (at < cutoff && !this.queues.has(chat)) this.lastAt.delete(chat);
  }

  private async throttle(): Promise<void> {
    for (;;) {
      const now = this.now();
      this.recent = this.recent.filter((at) => now - at < 1_000);
      if (this.recent.length < PER_SECOND) {
        this.recent.push(now);
        return;
      }
      await this.sleep(Math.max(1, 1_000 - (now - this.recent[0])));
    }
  }

  private async attempt<T>(method: string, params: Record<string, unknown>): Promise<T | null> {
    for (let tries = 0; ; tries += 1) {
      await this.throttle();
      try {
        const result = await this.api.call<T>(method, params);
        this.stats.calls += 1;
        return result;
      } catch (error) {
        const e = error instanceof TelegramError ? error : null;
        if (e?.status === 429 && tries < RETRIES) {
          await this.sleep((e.retryAfter ?? 1) * 1_000);
          continue;
        }
        if (e?.status === 0 && tries < 1 && method !== "sendMessage") {
          await this.sleep(1_000);
          continue;
        }
        if (e && HARMLESS.test(e.description)) return null;
        this.stats.failed += 1;
        this.stats.lastError = e ? e.message : "request failed";
        this.log(`${method} failed: ${this.stats.lastError}`);
        return null;
      }
    }
  }
}
