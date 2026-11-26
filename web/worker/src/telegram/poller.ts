import type { BotApi } from "./api";
import { afterPollError } from "./poller-errors";
import { WaitingUpdates } from "./poller-wait";
import type { Sleep } from "./sender";
import type { TgUpdate } from "./types";

export type PollState = "starting" | "ok" | "conflict" | "unauthorized" | "error" | "stopped";

/** The update kinds the bot reads (Telegram sends no others). Edits and membership changes are the community agent's (the router passes on no others); chat_member comes only to an admin. */
export const ALLOWED_UPDATES = ["message", "edited_message", "callback_query", "inline_query", "chat_member", "my_chat_member"];
/** Updates being answered at once; past this a burst is confirmed without answers rather than queued without end. */
const MAX_IN_FLIGHT = 100;
/** Priority updates waiting for a free slot, by default. */
const BUFFER_MAX = 2_000;
const LOG_GAP_MS = 60_000;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PollerOptions {
  /** Updates kept waiting instead of dropped while 100 are in flight: the community groups' and the admin chat's. */
  priority?: (u: TgUpdate) => boolean;
  /** How many may wait (and how many may be held); past that they are dropped and counted like the rest. */
  bufferMax?: number;
  /** Updates held, unanswered, until release() (2 minutes at most): the community chats' while the agent starts, everything else answered at once. */
  hold?: (u: TgUpdate) => boolean;
}

/**
 * Long polling (getUpdates): one request held open up to 50 s, the next
 * offset confirming everything before it. Updates are answered side by side
 * (each chat's answers in order in the Sender), at most 100 at once; past
 * that a priority update (a community group's) waits for a slot, 5 minutes
 * at most, then is dropped as stale, and any other is confirmed without an
 * answer. Updates `hold` picks wait unanswered until release(), 2 minutes at
 * most (poller-wait.ts). stop() empties both: already confirmed, they are
 * lost, which the log counts. Failed polls: poller-errors.ts.
 */
export class Poller {
  readonly health: { state: PollState; lastUpdateAt: number | null; updates: number; dropped: number; stale: number } = { state: "starting", lastUpdateAt: null, updates: 0, dropped: 0, stale: 0 };
  private droppedLoggedAt = 0;
  private staleLoggedAt = 0;
  private offset = 0;
  private stopped = false;
  private inFlight = 0;
  /** Priority updates waiting for a slot (5 minutes at most) and updates held for release() (2 at most): members' text, none after stop. */
  private readonly lists = new WaitingUpdates();
  private holding: boolean;
  private readonly priority: (u: TgUpdate) => boolean;
  private readonly hold: (u: TgUpdate) => boolean;
  private readonly bufferMax: number;

  constructor(
    private readonly api: BotApi,
    private readonly handle: (update: TgUpdate) => Promise<void>,
    private readonly log: (line: string) => void,
    private readonly sleep: Sleep = realSleep,
    private readonly now: () => number = Date.now,
    options: PollerOptions = {},
  ) {
    this.priority = options.priority ?? (() => false);
    this.hold = options.hold ?? (() => false);
    this.holding = options.hold !== undefined;
    this.bufferMax = Math.max(0, Math.floor(options.bufferMax ?? BUFFER_MAX));
  }

  /** Priority updates waiting for a slot now. */
  get buffered(): number {
    return this.lists.buffered;
  }

  /** Updates held for release() now. */
  get holdingCount(): number {
    return this.lists.holding;
  }

  stop(): void {
    this.stopped = true;
    this.health.state = "stopped";
    const lost = this.lists.clear();
    this.holding = false;
    if (lost > 0) this.log(`stopped: ${lost} waiting updates dropped`);
  }

  /**
   * Hands what `hold` kept on, oldest first, as if it had just come (a slot,
   * or the priority buffer), and holds nothing from then on. One that waited
   * 2 minutes is dropped as stale; the router gives a message older than 5
   * minutes the stale path.
   */
  release(): void {
    if (!this.holding) return;
    this.holding = false;
    this.prune(this.now());
    for (const update of this.lists.takeHeld()) this.route(update);
  }

  async run(): Promise<void> {
    let backoff = 1_000;
    while (!this.stopped) {
      // At least every long poll (50 s), whatever the handlers do: nothing waits past its time.
      this.prune(this.now());
      let updates: TgUpdate[];
      try {
        updates = await this.api.call<TgUpdate[]>("getUpdates", { offset: this.offset, timeout: 50, allowed_updates: ALLOWED_UPDATES }, 65_000);
      } catch (error) {
        if (this.stopped) return;
        const go = await afterPollError(error, { api: this.api, log: this.log, sleep: this.sleep, backoff, setState: (state) => void (this.health.state = state) });
        if (!go) return;
        if (this.health.state === "error") backoff = Math.min(30_000, backoff * 2);
        continue;
      }
      // Stopped while the request was open: these updates stay unconfirmed, for the next start.
      if (this.stopped) return;
      backoff = 1_000;
      this.health.state = "ok";
      if (!Array.isArray(updates)) continue;
      for (const update of updates) this.dispatch(update);
    }
  }

  private dispatch(update: TgUpdate): void {
    if (typeof update?.update_id !== "number") return;
    this.offset = Math.max(this.offset, update.update_id + 1);
    this.health.updates += 1;
    this.health.lastUpdateAt = this.now();
    if (this.holding && this.test(this.hold, update)) {
      if (this.lists.holding < this.bufferMax) this.lists.hold(update, this.now());
      else this.dropped();
      return;
    }
    this.route(update);
  }

  /** A slot, else the priority buffer, else confirmed without an answer. */
  private route(update: TgUpdate): void {
    if (this.inFlight < MAX_IN_FLIGHT) return this.start(update);
    if (this.lists.buffered < this.bufferMax && this.test(this.priority, update)) {
      this.lists.forSlot(update, this.now());
      return;
    }
    this.dropped();
  }

  private dropped(): void {
    this.health.dropped += 1;
    if (this.now() - this.droppedLoggedAt > LOG_GAP_MS) {
      this.droppedLoggedAt = this.now();
      this.log(`busy: ${this.health.dropped} updates confirmed without an answer so far`);
    }
  }

  /** Drops what waited past its time, oldest first: 5 minutes in the priority buffer, 2 held for release(). */
  private prune(now: number): void {
    const stale = this.lists.prune(now);
    if (stale === 0) return;
    this.health.stale += stale;
    if (now - this.staleLoggedAt > LOG_GAP_MS) {
      this.staleLoggedAt = now;
      this.log(`stale: ${this.health.stale} waiting updates dropped after their time so far`);
    }
  }

  private test(check: (u: TgUpdate) => boolean, update: TgUpdate): boolean {
    try {
      return check(update) === true;
    } catch {
      return false;
    }
  }

  private start(update: TgUpdate): void {
    this.inFlight += 1;
    let run: Promise<void>;
    try {
      run = this.handle(update);
    } catch (error) {
      run = Promise.reject(error);
    }
    void Promise.resolve(run)
      // Only the error's name: a message could one day carry someone's text into the logs.
      .catch((error: unknown) => this.log(`an update failed: ${error instanceof Error ? error.name : "error"}`))
      .finally(() => {
        this.inFlight -= 1;
        this.next();
      });
  }

  /** Starts waiting priority updates, oldest first, while slots are free; those past 5 minutes are dropped as stale. */
  private next(): void {
    this.prune(this.now());
    while (!this.stopped && this.inFlight < MAX_IN_FLIGHT && this.lists.buffered > 0) {
      const waited = this.lists.next();
      if (waited) this.start(waited);
    }
  }
}
