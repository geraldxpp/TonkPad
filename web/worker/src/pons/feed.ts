import { NATIVE_ETH, parsePonsLog, PONS_TOPICS, type PonsEvent, type PonsLaunch, readDecimals, readTokenMeta, USDG, WETH } from "../sources/pons";
import type { PonsRpc } from "../sources/robinhood";
import type { PonsBook } from "./book";

/** Blocks per eth_getLogs call (the public RPC's limit). */
const WINDOW = 10_000;
const DAY_SECONDS = 86_400;
/** Name, ticker and logo lookups per poll, newest tokens first. */
const META_PER_POLL = 50;
/** Lookups per token before giving up (it keeps its address as its name). */
const META_ATTEMPTS = 5;

const isLaunch = (e: PonsEvent): e is PonsLaunch => e.kind === "launch";

/**
 * Follows Pons on Robinhood Chain by polling the chain's logs: every launch,
 * curve trade and graduation since the last poll. A fresh start (or a gap of
 * more than a day) rebuilds the last day from the chain. `cursor` is the last
 * block read; the snapshot keeps it.
 */
export class PonsFeed {
  private readonly decimals = new Map<string, number>([
    [NATIVE_ETH, 18],
    [WETH, 18],
    [USDG, 6],
  ]);
  /** Tokens still missing their name, ticker or logo → lookups tried so far. */
  private readonly pendingMeta = new Map<string, number>();
  private blocksPerDay: number | null = null;
  /** The cursor block's time, in seconds (the public RPC's logs carry no times). */
  private cursorTime: number | null = null;

  constructor(
    private readonly rpc: PonsRpc,
    private readonly book: PonsBook,
    public cursor: number | null = null,
  ) {}

  /** Reads up to the chain head; returns how many launches and trades it applied. */
  async poll(): Promise<{ launches: number; trades: number }> {
    const head = await this.rpc.blockNumber();
    const day = await this.dayInBlocks(head);
    if (this.cursor === null || head - this.cursor > day || this.cursor > head) {
      // Curves can only be rebuilt from their launch, so start over from a day back.
      this.book.clear();
      this.cursor = head - day;
      this.cursorTime = null;
    }
    let launches = 0;
    let trades = 0;
    while (this.cursor < head) {
      const start = this.cursor;
      const from = start + 1;
      const to = Math.min(head, from + WINDOW - 1);
      // Times between the cursor and the window's last block are interpolated (blocks are ~0.1 s apart).
      const startTime = this.cursorTime ?? (await this.rpc.blockTime(start));
      const endTime = await this.rpc.blockTime(to);
      const timeOf = (block: number) => (startTime + ((block - start) / (to - start)) * (endTime - startTime)) * 1000;
      const events = (await this.rpc.logs(from, to, Object.values(PONS_TOPICS)))
        .map((log) => parsePonsLog(log, timeOf))
        .filter((e): e is PonsEvent => e !== null);
      await this.learnDecimals(events.filter(isLaunch));
      for (const e of events) {
        if (e.kind === "launch") {
          const decimals = this.decimals.get(e.quote);
          if (decimals !== undefined && this.book.launch(e, decimals)) {
            this.pendingMeta.set(e.token, 0);
            launches += 1;
          }
        } else if (e.kind === "trade") {
          if (this.book.trade(e)) trades += 1;
        } else {
          this.book.graduate(e);
        }
      }
      this.cursor = to;
      this.cursorTime = endTime;
    }
    await this.fillMeta();
    return { launches, trades };
  }

  private async learnDecimals(launches: readonly PonsLaunch[]): Promise<void> {
    for (const quote of new Set(launches.map((l) => l.quote))) {
      if (this.decimals.has(quote)) continue;
      const decimals = await readDecimals(this.rpc, quote);
      if (decimals !== null) this.decimals.set(quote, decimals);
    }
  }

  /** Names, tickers and logos for new tokens, a few at a time; misses are retried next poll. */
  private async fillMeta(): Promise<void> {
    const batch = [...this.pendingMeta.keys()].reverse().slice(0, META_PER_POLL);
    for (let i = 0; i < batch.length; i += 5) {
      await Promise.all(
        batch.slice(i, i + 5).map(async (token) => {
          const meta = await readTokenMeta(this.rpc, token);
          this.book.meta(token, meta);
          const attempts = (this.pendingMeta.get(token) ?? 0) + 1;
          if (meta.symbol || attempts >= META_ATTEMPTS) this.pendingMeta.delete(token);
          else this.pendingMeta.set(token, attempts);
        }),
      );
    }
  }

  private async dayInBlocks(head: number): Promise<number> {
    if (this.blocksPerDay === null) {
      const back = 500_000;
      const [now, then] = await Promise.all([this.rpc.blockTime(head), this.rpc.blockTime(head - back)]);
      const secondsPerBlock = Math.max((now - then) / back, 0.01);
      this.blocksPerDay = Math.round(DAY_SECONDS / secondsPerBlock);
    }
    return this.blocksPerDay;
  }
}
