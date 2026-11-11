import type { TrackedToken } from "../model";
import type { PoolRequest, RawCandle } from "../sources/geckoterminal";

/** Minute candles kept per pool: GeckoTerminal's most per call, about 16 hours of a busy token. */
export const MAX_MINUTES = 1_000;

/** A pool's candles as GeckoTerminal sent them (USD per token and USD volume). */
export interface PoolHistory {
  minute: RawCandle[];
  /** True when the minute candles reach back to the pool's first trade. */
  minuteComplete: boolean;
  /** Hour candles, fetched when the minutes stop short of the pool's first trade. */
  hour: RawCandle[] | null;
  hourComplete: boolean;
  /** When the minute candles were fetched, ms. */
  fetchedAt: number;
}

/**
 * The GeckoTerminal pools behind a token's chart: its trusted DexScreener pair
 * and, once a Solana token graduates, the curve it traded on before. Pons
 * curves chart from their own trades instead.
 */
export function chartPools(token: TrackedToken): { main: PoolRequest | null; curve: PoolRequest | null } {
  const network = token.chain === "sol" ? "solana" : "robinhood";
  const request = (pool: string | null | undefined) => (pool ? { network, pool, token: token.address } as const : null);
  if (token.pons && !token.graduated) return { main: null, curve: null };
  const curve = !token.pons && token.graduated && token.curvePool !== token.pool ? request(token.curvePool) : null;
  return { main: request(token.pool), curve };
}

/** New 1m candles replace the stored ones from their first minute on; the newest 1,000 are kept. */
export function mergeMinutes(previous: PoolHistory | null, rows: RawCandle[], limit: number, at: number): PoolHistory {
  const complete = rows.length < limit;
  if (!previous) return { minute: rows.slice(-MAX_MINUTES), minuteComplete: complete && rows.length <= MAX_MINUTES, hour: null, hourComplete: false, fetchedAt: at };
  const first = rows[0]?.[0] ?? Infinity;
  const merged = complete && !previous.minuteComplete ? rows : [...previous.minute.filter((r) => r[0] < first), ...rows];
  const minuteComplete = (complete || previous.minuteComplete) && merged.length <= MAX_MINUTES;
  return { ...previous, minute: merged.slice(-MAX_MINUTES), minuteComplete, fetchedAt: at };
}
