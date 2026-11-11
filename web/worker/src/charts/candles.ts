import type { Candle, ChartTimeframe } from "@/shared/types/token-detail";
import type { RawCandle } from "../sources/geckoterminal";

/** Candles kept per timeframe, about as many as the reference chart shows. */
export const CANDLES_PER_TIMEFRAME = 60;
export const TF_SECONDS: Record<ChartTimeframe, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3_600, "4h": 14_400, "1D": 86_400 };
const HOUR = 3_600;

/** A run of 1m candles, and whether it reaches back to the first trade. */
export interface CandleRun {
  candles: Candle[];
  complete: boolean;
}

/** Everything known about a token's trades, ready to cut into timeframes. */
export interface History {
  /** 1m candles, oldest first. */
  minute: Candle[];
  /** First second from which `minute` holds every trade; null when it reaches back to the first trade. */
  from: number | null;
  /** Candles (1h or finer) from before `from`, for the 1h, 4h and 1D charts. */
  older: Candle[];
  /** First second from which `older` holds every trade; null when it reaches back to the first trade. */
  olderFrom: number | null;
}

/** Market-cap candles from GeckoTerminal's USD prices per token; USD volume becomes the chain's coin. */
export function fromRaw(raw: readonly RawCandle[], supply: number, nativeUsd: number | null): Candle[] {
  return raw.map(([time, open, high, low, close, volume]) => ({
    time,
    open: open * supply,
    high: high * supply,
    low: low * supply,
    close: close * supply,
    volume: nativeUsd ? volume / nativeUsd : 0,
  }));
}

/** Candles in buckets of `size` seconds: the first open, the last close, the extremes and the summed volume. */
export function aggregate(candles: readonly Candle[], size: number): Candle[] {
  const out: Candle[] = [];
  for (const c of candles) {
    const time = Math.floor(c.time / size) * size;
    const last = out[out.length - 1];
    if (last && time <= last.time) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else out.push({ time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
  }
  return out;
}

/**
 * The newest observed market cap (ms, USD) folded into the last minute when it
 * falls in it. A later minute waits for the next fetch, so no candle shows
 * trades without their volume.
 */
export function withObservation(minute: readonly Candle[], at: number, value: number): Candle[] {
  const last = minute[minute.length - 1];
  if (!last || !(value > 0) || Math.floor(at / 60_000) * 60 !== last.time) return [...minute];
  return [...minute.slice(0, -1), { ...last, high: Math.max(last.high, value), low: Math.min(last.low, value), close: value }];
}

/**
 * A curve's candles up to the end of its pool's first candle (`first`, `size`
 * seconds long). The curve and the pool are separate pools whose trades never
 * overlap (the pool opens at graduation), so a shared candle is merged, curve
 * first; anything later from the curve is dropped.
 */
const before = (curve: CandleRun | null, first: number | undefined, size: number) =>
  curve && first !== undefined ? curve.candles.filter((c) => c.time < first + size) : curve?.candles ?? [];

/** Where the curve's part starts when it doesn't reach back to the launch. */
const curveFrom = (curve: CandleRun | null, early: readonly Candle[]) => (curve && !curve.complete && early.length > 0 ? early[0].time : null);

/**
 * A pool's candles with the curve it graduated from in front: the minute
 * candles (complete back to the pool's first trade, or to their first
 * candle) and, when they stop short, the pool's hour candles before them.
 */
export function joinHistory(curve: CandleRun | null, pool: CandleRun, hour: CandleRun | null): History {
  if (pool.complete) {
    const early = before(curve, pool.candles[0]?.time, 60);
    return { minute: [...early, ...pool.candles], from: curveFrom(curve, early), older: [], olderFrom: null };
  }
  const from = pool.candles[0]?.time ?? null;
  if (!hour) return { minute: pool.candles, from, older: [], olderFrom: from };
  if (!hour.complete) return { minute: pool.candles, from, older: hour.candles, olderFrom: hour.candles[0]?.time ?? from };
  const early = before(curve, hour.candles[0]?.time, HOUR);
  return { minute: pool.candles, from, older: [...early, ...hour.candles], olderFrom: curveFrom(curve, early) };
}

/** One timeframe: only buckets the history covers in full, the newest 60. */
export function timeframeCandles(history: History, timeframe: ChartTimeframe): Candle[] {
  const size = TF_SECONDS[timeframe];
  let base: readonly Candle[] = history.minute;
  let from = history.from;
  if (size >= HOUR && from !== null && history.older.length > 0) {
    // Whole hours from the hour candles, the rest from the minutes.
    const cut = Math.ceil(from / HOUR) * HOUR;
    base = [...history.older.filter((c) => c.time < cut), ...history.minute.filter((c) => c.time >= cut)];
    from = history.olderFrom;
  }
  const start = from === null ? -Infinity : Math.ceil(from / size) * size;
  return aggregate(base.filter((c) => c.time >= start), size).slice(-CANDLES_PER_TIMEFRAME);
}
