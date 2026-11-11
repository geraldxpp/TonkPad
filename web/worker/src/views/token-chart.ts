import { CHART_TIMEFRAMES, type Candle, type ChartTimeframe, type TokenChart } from "@/shared/types/token-detail";
import { chartPools, type PoolHistory } from "../charts/pools";
import { type CandleRun, fromRaw, type History, joinHistory, TF_SECONDS, timeframeCandles, withObservation } from "../charts/candles";
import { basicQuoteUsd, ponsCandles } from "../charts/pons";
import type { TrackedToken } from "../model";
import { PONS_SUPPLY } from "../pons/curve";
import type { PoolRequest } from "../sources/geckoterminal";

/** What the live chart can draw from besides the token's own record. */
export interface ChartInputs {
  /** GeckoTerminal candles the worker holds for the pools of open tokens. */
  pools?: { history: (request: PoolRequest) => PoolHistory | undefined };
  /** A Pons quote asset's USD price now (ETH, USDG or a tokenized stock). */
  quoteUsd?: (quote: string) => number | null;
}

/** OHLC of observed market-cap samples, with no interpolated prices or invented volume. */
export function observedCandles(samples: ReadonlyArray<readonly [number, number]>, timeframe: ChartTimeframe): Candle[] {
  const size = TF_SECONDS[timeframe];
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

function chartOf(candlesFor: (timeframe: ChartTimeframe) => Candle[], volumeAvailable: boolean, attribution?: "geckoterminal"): TokenChart {
  const candles = {} as TokenChart["candles"];
  const marks = {} as TokenChart["marks"];
  for (const timeframe of CHART_TIMEFRAMES) {
    candles[timeframe] = candlesFor(timeframe);
    marks[timeframe] = [];
  }
  return { candles, marks, volumeAvailable, callout: null, graduationCap: null, ...(attribution ? { attribution } : {}) };
}

export function observedChart(samples: ReadonlyArray<readonly [number, number]>): TokenChart {
  return chartOf((timeframe) => observedCandles(samples, timeframe), false);
}

const historyChart = (history: History, volume: boolean, attribution?: "geckoterminal") =>
  chartOf((timeframe) => timeframeCandles(history, timeframe), volume, attribution);

/** Market cap per USD of token price: DexScreener's own ratio, so the chart meets the header. */
function capPerPrice(token: TrackedToken): number | null {
  if (token.marketCap > 0 && token.priceUsd > 0) return token.marketCap / token.priceUsd;
  return token.pons ? PONS_SUPPLY : null;
}

/**
 * The live chart: trade candles where the worker has them (a Pons curve's own
 * trades; GeckoTerminal's candles for the pools of open tokens, the curve's
 * history in front once it graduates), else the market caps it observed.
 * `nativeUsd` is the chain coin's price, which volume is shown in.
 */
export function liveChart(token: TrackedToken, nativeUsd: number | null, inputs: ChartInputs = {}): TokenChart {
  const quoteUsd = inputs.quoteUsd ?? basicQuoteUsd(token.chain === "rh" ? nativeUsd : null);
  const usd = token.pons ? quoteUsd(token.pons.quote) : null;
  const trades = token.pons && usd !== null ? ponsCandles(token, usd, token.chain === "rh" ? nativeUsd : null) : null;
  const { main, curve } = chartPools(token);
  const pool = main ? inputs.pools?.history(main) : undefined;
  const supply = capPerPrice(token);
  if (pool && pool.minute.length > 0 && supply !== null) {
    let minute = fromRaw(pool.minute, supply, nativeUsd);
    // Between fetches the newest market cap moves the last candle, while the token is trading.
    const active = token.windows.m5.buys + token.windows.m5.sells > 0;
    if (active && token.marketAt > pool.fetchedAt) minute = withObservation(minute, token.marketAt, token.marketCap);
    const left = curve ? inputs.pools?.history(curve) : undefined;
    const before: CandleRun | null = trades
      ?? (left && left.minute.length > 0 ? { candles: fromRaw(left.minute, supply, nativeUsd), complete: left.minuteComplete } : null);
    const hour = pool.hour ? { candles: fromRaw(pool.hour, supply, nativeUsd), complete: pool.hourComplete } : null;
    const history = joinHistory(before, { candles: minute, complete: pool.minuteComplete }, hour);
    return historyChart(history, nativeUsd !== null && (trades?.volume ?? true), "geckoterminal");
  }
  if (trades && trades.candles.length > 0 && !token.graduated) {
    const from = trades.complete ? null : trades.candles[0].time;
    return historyChart({ minute: trades.candles, from, older: [], olderFrom: null }, trades.volume);
  }
  return observedChart(token.mcapSeries);
}
