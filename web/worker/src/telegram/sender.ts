import { type BotApi, TelegramError } from "./api";
import { Lanes, type Priority, type Sleep } from "./sender-lanes";

export type { Priority, Sleep } from "./sender-lanes";

/** Between two messages to one chat: a person's chat about one a second; a group or the channel 20 a minute. */
export const PRIVATE_GAP = 1_000;
export const GROUP_GAP = 3_000;
const RETRIES = 3;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A call's place among the second's 25 (messages unless given), and how long it may wait for one. */
export interface DirectOptions {
  priority?: Priority;
  /** From the call to being sent, ms, the wait for a slot and Telegram's retry_after waits included; past it the call is dropped unsent. */
  maxWaitMs?: number;
}

/** How long a call for one chat may wait: in its queue, and in all, past which it is dropped. */
export interface ChatLimits {
  /** Calls the chat may have waiting; past that, a new one is dropped at once. */
  maxQueued?: number;
  /** From being queued to being sent, ms, the wait for a slot and Telegram's retry_after waits included. */
  maxWaitMs?: number;
  /** One request's timeout, ms. */
  timeoutMs?: number;
  /** Its place among the second's 25: messages unless given (a check message's cosmetic edit goes after them). */
  priority?: Priority;
}

/** A refreshed card that didn't change, or a button press answered too late: nothing to report. */
const HARMLESS = /message is not modified|query is too old|query ID is invalid/i;

/**
 * Sends Bot API calls inside Telegram's limits: in order per chat, a gap
 * apart, at most 25 a second overall, handed out by priority (sender-lanes.ts:
 * moderation first, press answers last). A 429 waits Telegram's retry_after; a
 * dropped connection is tried once more, except for a new message, which
 * Telegram may already have taken (a repeat would post it twice); anything
 * else (403 blocked or removed, 400) is counted, logged with Telegram's own
 * words and dropped. A chat may cap how many of its calls wait in line: past
 * that, a reply is dropped at once rather than left waiting for minutes. A
 * call with a deadline that passes while it waits, in its chat's line or for
 * a slot, is dropped unsent.
 */
export class Sender {
  readonly stats = { calls: 0, failed: 0, dropped: 0, lastError: "" };
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly pending = new Map<string, number>();
  private readonly lastAt = new Map<string, number>();
  private readonly lanes: Lanes;

  constructor(
    private readonly api: BotApi,
    private readonly log: (line: string) => void,
    private readonly now: () => number = Date.now,
    private readonly sleep: Sleep = realSleep,
  ) {
    this.lanes = new Lanes(now, sleep);
  }

  /** A call that isn't a message (a moderation call, a read, answering a button press or an inline query): no per-chat gap. */
  direct<T>(method: string, params: Record<string, unknown>, options: DirectOptions = {}): Promise<T | null> {
    const deadline = this.now() + (options.maxWaitMs ?? Number.POSITIVE_INFINITY);
    return this.attempt<T>(method, params, options.priority ?? "send", deadline);
  }

  /**
   * A message or an edit for one chat, queued behind that chat's earlier
   * ones. Null at once when `maxQueued` already wait, and null when it would
   * go out later than `maxWaitMs` after it was queued: a reply to a person
   * never lingers (module 14's replies hold an ID for well under a minute,
   * inside the privacy page's keeps.memory line of 10 minutes at most).
   */
  toChat<T>(chat: string, gap: number, method: string, params: Record<string, unknown>, limits: ChatLimits = {}): Promise<T | null> {
    const { maxQueued = Number.POSITIVE_INFINITY, maxWaitMs = Number.POSITIVE_INFINITY, timeoutMs, priority = "send" } = limits;
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
        return await this.attempt<T>(method, params, priority, deadline, timeoutMs);
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

  /** Calls queued for this key, the one being sent included: what toChat's `maxQueued` is compared with. */
  waiting(chat: string): number {
    return this.pending.get(chat) ?? 0;
  }

  /** Forgets chats with nothing queued and no reply within the longest gap: only the gap needs them, and module 14's sweep forgets them within a minute (the privacy page's keeps.memory allows 10 at most). */
  forget(now: number): void {
    for (const [chat, at] of this.lastAt) if (now - at >= GROUP_GAP && !this.queues.has(chat)) this.lastAt.delete(chat);
  }

  private async attempt<T>(method: string, params: Record<string, unknown>, priority: Priority, deadline: number, timeoutMs?: number): Promise<T | null> {
    for (let tries = 0; ; tries += 1) {
      if (!(await this.lanes.slot(priority, deadline))) {
        this.stats.dropped += 1;
        return null;
      }
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
