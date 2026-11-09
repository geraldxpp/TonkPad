import { CHART_TIMEFRAMES, type Candle, type ChartTimeframe, type TokenChart } from "@/shared/types/token-detail";

const SECONDS: Record<ChartTimeframe, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3_600, "4h": 14_400, "1D": 86_400 };

/** OHLC of observed market-cap samples, with no interpolated prices or invented volume. */
export function observedCandles(samples: ReadonlyArray<readonly [number, number]>, timeframe: ChartTimeframe): Candle[] {
  const size = SECONDS[timeframe];
  const buckets = new Map<number, Candle>();
  const ordered = samples.filter(([at, cap]) => Number.isFinite(at) && Number.isFinite(cap) && at >= 0 && cap > 0)
    .slice().sort((a, b) => a[0] - b[0]);
  for (const [at, cap] of ordered) {
    const time = Math.floor(at / 1000 / size) * size;
    const candle = buckets.get(time);
    if (candle) {
      candle.high = Math.max(candle.high, cap);
      candle.low = Math.min(candle.low, cap);
      candle.close = cap;
    } else buckets.set(time, { time, open: cap, high: cap, low: cap, close: cap, volume: 0 });
  }
  return [...buckets.values()];
}

export function observedChart(samples: ReadonlyArray<readonly [number, number]>): TokenChart {
  const candles = {} as TokenChart["candles"];
  const marks = {} as TokenChart["marks"];
  for (const timeframe of CHART_TIMEFRAMES) {
    candles[timeframe] = observedCandles(samples, timeframe);
    marks[timeframe] = [];
  }
  return { candles, marks, volumeAvailable: false, callout: null, graduationCap: null };
}
