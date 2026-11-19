import { type BotApi, TelegramError } from "./api";

/** Between two messages to one chat: a person's chat about one a second; a group or the channel 20 a minute. */
export const PRIVATE_GAP = 1_000;
export const GROUP_GAP = 3_000;
const PER_SECOND = 25;
const RETRIES = 3;

export type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** How long a call for one chat may wait: in its queue, and in all, past which it is dropped. */
export interface ChatLimits {
  /** Calls the chat may have waiting; past that, a new one is dropped at once. */
  maxQueued?: number;
  /** From being queued to being sent, ms, Telegram's retry_after waits included. */
  maxWaitMs?: number;
  /** One request's timeout, ms. */
  timeoutMs?: number;
}

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

  /**
   * A message or an edit for one chat, queued behind that chat's earlier
   * ones. Null at once when `maxQueued` already wait, and null when it would
   * go out later than `maxWaitMs` after it was queued: a reply to a person
   * never lingers (the privacy page promises their IDs are gone within a minute).
   */
  toChat<T>(chat: string, gap: number, method: string, params: Record<string, unknown>, limits: ChatLimits = {}): Promise<T | null> {
    const { maxQueued = Number.POSITIVE_INFINITY, maxWaitMs = Number.POSITIVE_INFINITY, timeoutMs } = limits;
    const deadline = this.now() + maxWaitMs;
    const waiting = this.pending.get(chat) ?? 0;
    if (waiting >= maxQueued) {
      this.stats.dropped += 1;
      return Promise.resolve(null);
    }
    this.pending.set(chat, waiting + 1);
    const previous = this.queues.get(chat) ?? Promise.resolve();
    const run = previous.then(async () => {
      const wait = (this.lastAt.get(chat) ?? 0) + gap - this.now();
      if (this.now() + Math.max(0, wait) > deadline) {
        this.stats.dropped += 1;
        return null;
      }
      if (wait > 0) await this.sleep(wait);
      try {
        return await this.attempt<T>(method, params, deadline, timeoutMs);
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
      if (this.lastAt.size > 5_000) this.forget(this.now());
    });
    return settled;
  }

  /** Forgets chats with nothing queued and no reply within the longest gap (only the gap needs them; the privacy page promises a minute at most). */
  forget(now: number): void {
    for (const [chat, at] of this.lastAt) if (now - at >= GROUP_GAP && !this.queues.has(chat)) this.lastAt.delete(chat);
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

  private async attempt<T>(method: string, params: Record<string, unknown>, deadline = Number.POSITIVE_INFINITY, timeoutMs?: number): Promise<T | null> {
    for (let tries = 0; ; tries += 1) {
      await this.throttle();
      try {
        const result = await this.api.call<T>(method, params, timeoutMs);
        this.stats.calls += 1;
        return result;
      } catch (error) {
        const e = error instanceof TelegramError ? error : null;
        const pause = e?.status === 429 ? (e.retryAfter ?? 1) * 1_000 : 1_000;
        if (this.now() + pause > deadline && (e?.status === 429 || e?.status === 0)) {
          this.stats.dropped += 1;
          return null;
        }
        if (e?.status === 429 && tries < RETRIES) {
          await this.sleep(pause);
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
