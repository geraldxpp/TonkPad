import { type BotApi, TelegramError } from "./api";
import type { Sleep } from "./sender";
import type { TgUpdate } from "./types";

export type PollState = "starting" | "ok" | "conflict" | "unauthorized" | "error" | "stopped";

/** The update kinds the bot reads; Telegram sends no others. */
export const ALLOWED_UPDATES = ["message", "callback_query", "inline_query"];
/** Updates being answered at once; past this a burst is confirmed without answers rather than queued without end. */
const MAX_IN_FLIGHT = 100;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Long polling (getUpdates): one request held open up to 50 s, the next
 * offset confirming everything before it. Updates are answered side by side
 * (each chat's answers stay in order in the Sender). A refused token (401)
 * stops polling; a 409 means a webhook is set (removed, then polling resumes)
 * or another process is polling the same bot (waits); anything else backs off.
 */
export class Poller {
  readonly health: { state: PollState; lastUpdateAt: number | null; updates: number; dropped: number } = { state: "starting", lastUpdateAt: null, updates: 0, dropped: 0 };
  private droppedLoggedAt = 0;
  private offset = 0;
  private stopped = false;
  private inFlight = 0;

  constructor(
    private readonly api: BotApi,
    private readonly handle: (update: TgUpdate) => Promise<void>,
    private readonly log: (line: string) => void,
    private readonly sleep: Sleep = realSleep,
    private readonly now: () => number = Date.now,
  ) {}

  stop(): void {
    this.stopped = true;
    this.health.state = "stopped";
  }

  async run(): Promise<void> {
    let backoff = 1_000;
    while (!this.stopped) {
      let updates: TgUpdate[];
      try {
        updates = await this.api.call<TgUpdate[]>("getUpdates", { offset: this.offset, timeout: 50, allowed_updates: ALLOWED_UPDATES }, 65_000);
      } catch (error) {
        if (this.stopped) return;
        const e = error instanceof TelegramError ? error : null;
        if (e?.status === 401 || e?.status === 404) {
          this.health.state = "unauthorized";
          this.log("Telegram refused the bot token; polling stopped (check TELEGRAM_BOT_TOKEN)");
          return;
        }
        if (e?.status === 409) {
          this.health.state = "conflict";
          if (/webhook/i.test(e.description)) {
            await this.api.call("deleteWebhook", { drop_pending_updates: false }).catch(() => null);
            this.log("removed a webhook so long polling can run");
            await this.sleep(2_000);
            continue;
          }
          this.log("another process is polling this bot; waiting");
          await this.sleep(30_000);
          continue;
        }
        this.health.state = "error";
        await this.sleep(backoff);
        backoff = Math.min(30_000, backoff * 2);
        continue;
      }
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
    if (this.inFlight >= MAX_IN_FLIGHT) {
      this.health.dropped += 1;
      if (this.now() - this.droppedLoggedAt > 60_000) {
        this.droppedLoggedAt = this.now();
        this.log(`busy: ${this.health.dropped} updates confirmed without an answer so far`);
      }
      return;
    }
    this.inFlight += 1;
    void this.handle(update)
      // Only the error's name: a message could one day carry someone's text into the logs.
      .catch((error: unknown) => this.log(`an update failed: ${error instanceof Error ? error.name : "error"}`))
      .finally(() => {
        this.inFlight -= 1;
      });
  }
}
