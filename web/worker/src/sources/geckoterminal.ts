/**
 * GeckoTerminal's free public API (no key): trade candles for a pool, looked
 * up by the same pool address DexScreener gives the worker (Pump.fun curves,
 * PumpSwap, Raydium, and Pons's Uniswap v4 pools on Robinhood Chain). Older
 * docs say 30 calls a minute; measured from one IP in Nov 2026 it allows
 * about 6, so charts/book.ts spends them only on tokens people have open.
 * Its terms ask for "Powered by GeckoTerminal" next to the chart (ChartCard).
 */
const BASE = "https://api.geckoterminal.com/api/v2";

export type GeckoNetwork = "solana" | "robinhood";
export type Resolution = "minute" | "hour";

/** [unix seconds, open, high, low, close, volume]: USD per token and USD traded, oldest first. */
export type RawCandle = [number, number, number, number, number, number];

/** A pool's candles, priced as the token (the pool's other side may be its base). */
export interface PoolRequest {
  network: GeckoNetwork;
  pool: string;
  token: string;
}

/** Solana base58 or an EVM address; Uniswap v4 pool ids are 32 bytes. */
const SAFE = /^(0x[0-9a-fA-F]{40}|0x[0-9a-fA-F]{64}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;

export class GeckoRateLimitError extends Error {
  constructor() {
    super("GeckoTerminal rate limit");
  }
}

/** Valid rows only, oldest first, with high and low widened to hold the open and close. */
export function parseOhlcv(body: unknown): RawCandle[] {
  const list = (body as { data?: { attributes?: { ohlcv_list?: unknown } } } | null)?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) return [];
  const out: RawCandle[] = [];
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [time, open, high, low, close, volume] = row.slice(0, 6).map(Number);
    const prices = [open, high, low, close];
    if (!Number.isInteger(time) || time <= 0 || prices.some((p) => !Number.isFinite(p) || p <= 0)) continue;
    if (!Number.isFinite(volume) || volume < 0) continue;
    out.push([time, open, Math.max(high, open, close), Math.min(low, open, close), close, volume]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * Up to `limit` (max 1000) of a pool's most recent candles with trades in them.
 * Null when GeckoTerminal doesn't know the pool (yet); throws on a rate limit.
 */
export async function fetchPoolCandles(request: PoolRequest, resolution: Resolution, limit: number): Promise<RawCandle[] | null> {
  const { network, pool, token } = request;
  if (!SAFE.test(pool) || !SAFE.test(token)) return null;
  const count = Math.min(1_000, Math.max(1, Math.ceil(limit)));
  const url = `${BASE}/networks/${network}/pools/${pool}/ohlcv/${resolution}?aggregate=1&limit=${count}&currency=usd&token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });
  if (res.status === 429) throw new GeckoRateLimitError();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GeckoTerminal HTTP ${res.status}`);
  return parseOhlcv(await res.json());
}
