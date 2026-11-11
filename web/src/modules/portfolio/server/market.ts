import { cached } from "@/shared/swap/server/cache";
import type { MarketSeries, PortfolioRange, PricePoint, TrackedCoin } from "../lib/types";

const CANDLES = "https://api.exchange.coinbase.com/products";
const DAY = 86_400;
/** Coinbase returns at most 300 candles a request. */
const MAX_CANDLES = 300;

const RANGE: Record<PortfolioRange, { granularity: number; seconds: number; cacheSeconds: number }> = {
  "1D": { granularity: 900, seconds: DAY, cacheSeconds: 120 },
  "1W": { granularity: 3_600, seconds: 7 * DAY, cacheSeconds: 600 },
  "1M": { granularity: 21_600, seconds: 30 * DAY, cacheSeconds: 1_800 },
  "1Y": { granularity: DAY, seconds: 365 * DAY, cacheSeconds: 21_600 },
};

/** How long a range's series may be shared. */
export const cacheSecondsOf = (range: PortfolioRange) => RANGE[range].cacheSeconds;

/** Coinbase's [time, low, high, open, close, volume] rows as [ms, close] points, oldest first. */
export function parseCandles(body: unknown): PricePoint[] {
  if (!Array.isArray(body)) throw new Error("Coinbase: bad response");
  return body
    .flatMap((row): PricePoint[] => (Array.isArray(row) && typeof row[0] === "number" && typeof row[4] === "number" && row[4] > 0 ? [[row[0] * 1000, row[4]]] : []))
    .sort((a, b) => a[0] - b[0]);
}

async function window(coin: TrackedCoin, granularity: number, start: number, end: number): Promise<PricePoint[]> {
  const query = new URLSearchParams({ granularity: String(granularity), start: new Date(start * 1000).toISOString(), end: new Date(end * 1000).toISOString() });
  const res = await fetch(`${CANDLES}/${coin}-USD/candles?${query}`, { headers: { accept: "application/json", "user-agent": "tonkfun-portfolio" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Coinbase: HTTP ${res.status}`);
  return parseCandles(await res.json());
}

/** A coin's closes across a range, in as many requests as the range needs. */
async function coinSeries(coin: TrackedCoin, range: PortfolioRange): Promise<PricePoint[]> {
  const { granularity, seconds } = RANGE[range];
  const end = Math.floor(Date.now() / 1000);
  const span = MAX_CANDLES * granularity;
  const windows: [number, number][] = [];
  for (let to = end; to > end - seconds; to -= span) windows.push([Math.max(end - seconds, to - span), to]);
  const parts = await Promise.all(windows.map(([from, to]) => window(coin, granularity, from, to)));
  const seen = new Set<number>();
  return parts
    .flat()
    .filter(([time]) => !seen.has(time) && Boolean(seen.add(time)))
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Real price history for the two coins the portfolio chart can trace back
 * over any range. Nothing here is about a wallet, so one read serves every
 * visitor. A coin that can't be read comes back null and the chart says what
 * it couldn't cover.
 */
export function readMarket(range: PortfolioRange): Promise<MarketSeries> {
  return cached(`portfolio:market:${range}`, RANGE[range].cacheSeconds * 1000, async () => {
    const [sol, eth] = await Promise.allSettled([coinSeries("SOL", range), coinSeries("ETH", range)]);
    return { range, SOL: sol.status === "fulfilled" ? sol.value : null, ETH: eth.status === "fulfilled" ? eth.value : null };
  });
}
