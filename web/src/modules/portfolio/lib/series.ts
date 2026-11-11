import type { MarketSeries, PortfolioAsset, PortfolioRange, PricePoint } from "./types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RANGE_MS: Record<PortfolioRange, number> = { "1D": DAY, "1W": 7 * DAY, "1M": 30 * DAY, "1Y": 365 * DAY };
/** Points on the time axis when no candles could be read. */
const FALLBACK_POINTS = 48;

/** The latest close at or before `time`; before the first candle, the first close. */
function closeAt(points: readonly PricePoint[], time: number): number {
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (points[middle][0] <= time) low = middle;
    else high = middle - 1;
  }
  return points[low][1];
}

/** A token's own price at the moments its market data speaks of, oldest first. */
function anchorsOf(asset: PortfolioAsset, now: number): PricePoint[] {
  const price = asset.priceUsd ?? 0;
  const windows: [number | null, number][] = [
    [asset.change.h24, DAY],
    [asset.change.h6, 6 * HOUR],
    [asset.change.h1, HOUR],
    [asset.change.m5, 300_000],
  ];
  const past = windows.flatMap(([change, age]): PricePoint[] => (change === null || change <= -100 ? [] : [[now - age, price / (1 + change / 100)]]));
  return [...past, [now, price]];
}

/** Straight lines between anchors; before the first, its price. */
function interpolate(anchors: readonly PricePoint[], time: number): number {
  if (time <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i += 1) {
    const [t0, p0] = anchors[i - 1];
    const [t1, p1] = anchors[i];
    if (time <= t1) return t1 === t0 ? p1 : p0 + ((p1 - p0) * (time - t0)) / (t1 - t0);
  }
  return anchors[anchors.length - 1][1];
}

/** This asset's value at `time`, holding today's balance. */
function valueAt(asset: PortfolioAsset, market: MarketSeries | null, anchors: readonly PricePoint[], time: number): number {
  const value = asset.valueUsd ?? 0;
  if (asset.stable || !asset.priceUsd) return value;
  const candles = asset.track ? market?.[asset.track] : null;
  if (candles && candles.length > 0) {
    const latest = candles[candles.length - 1][1];
    return latest > 0 ? (value * closeAt(candles, time)) / latest : value;
  }
  return asset.balance * interpolate(anchors, time);
}

/** True when an asset's value can really be traced across the range. */
function hasHistory(asset: PortfolioAsset, market: MarketSeries | null, range: PortfolioRange): boolean {
  if (asset.stable) return true;
  if (asset.track && market?.[asset.track]?.length) return true;
  return range === "1D" && asset.change.h24 !== null;
}

export interface PortfolioSeries {
  /** Oldest first; the last point is exactly today's total. */
  points: PricePoint[];
  /** The share of today's value with real price history across the range, 0–1. */
  coverage: number;
}

/**
 * What the wallet's current holdings were worth across a range, from real
 * prices: candles for SOL and ETH, the market's own 5-minute, 1-hour, 6-hour
 * and 24-hour moves for other tokens. It is not a record of past balances:
 * nothing here knows what the wallet held last week, and the screen says so.
 * A token with no longer history stays at its oldest known price, so a new
 * token can't paint a fake rally.
 */
export function portfolioSeries(assets: readonly PortfolioAsset[], market: MarketSeries | null, range: PortfolioRange, now: number): PortfolioSeries {
  const priced = assets.filter((asset) => asset.priceUsd !== null && (asset.valueUsd ?? 0) > 0);
  const total = priced.reduce((sum, asset) => sum + (asset.valueUsd ?? 0), 0);
  if (total <= 0) return { points: [], coverage: 0 };
  const start = now - RANGE_MS[range];
  const base = market?.SOL?.length ? market.SOL : market?.ETH?.length ? market.ETH : null;
  const candleTimes = base ? base.map(([time]) => time).filter((time) => time >= start && time < now) : [];
  const times = candleTimes.length > 1 ? candleTimes : Array.from({ length: FALLBACK_POINTS }, (_, i) => start + (i * RANGE_MS[range]) / FALLBACK_POINTS);
  const anchors = new Map(priced.map((asset) => [asset, anchorsOf(asset, now)]));
  const points = times.map((time): PricePoint => [time, priced.reduce((sum, asset) => sum + valueAt(asset, market, anchors.get(asset) ?? [], time), 0)]);
  const covered = priced.filter((asset) => hasHistory(asset, market, range)).reduce((sum, asset) => sum + (asset.valueUsd ?? 0), 0);
  return { points: [...points, [now, total]], coverage: covered / total };
}
