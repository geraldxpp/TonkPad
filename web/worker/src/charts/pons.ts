import type { Candle } from "@/shared/types/token-detail";
import type { TrackedToken } from "../model";
import { newPonsState, PONS_SUPPLY, ponsSpot } from "../pons/curve";
import { NATIVE_ETH, USDG, WETH } from "../sources/pons";
import type { CandleRun } from "./candles";

const MINUTE = 60_000;

/** A Pons quote asset's USD price from what the views know: ETH, and USDG at $1. */
export function basicQuoteUsd(ethUsd: number | null): (quote: string) => number | null {
  return (quote) => (quote === NATIVE_ETH || quote === WETH ? ethUsd : quote === USDG ? 1 : null);
}

export interface CurveCandles extends CandleRun {
  /** False when the quote asset's volume can't be put in ETH (the candles carry 0). */
  volume: boolean;
}

/**
 * 1m candles from a Pons curve's own trades, read from the chain: each trade
 * prices the token at the curve's spot after it, and a minute opens at the
 * price before its first trade. Market cap is in USD at the quote asset's
 * price now; volume is the quote asset traded, in ETH.
 */
export function ponsCandles(token: TrackedToken, quoteUsd: number, ethUsd: number | null): CurveCandles | null {
  const pons = token.pons;
  if (!pons || pons.trades.length === 0 || !(quoteUsd > 0)) return null;
  const native = pons.quote === NATIVE_ETH || pons.quote === WETH;
  const ethPerQuote = native ? 1 : ethUsd && ethUsd > 0 ? quoteUsd / ethUsd : null;
  const cap = PONS_SUPPLY * quoteUsd;
  // The creator's buy rides in the launch transaction; later starts mean older trades were trimmed.
  const complete = pons.trades[0][0] - token.createdAt < MINUTE;
  // A fresh curve with the same graduation amount is the curve at launch.
  let previous = complete ? ponsSpot(newPonsState(pons)) : pons.trades[0][3];
  const candles: Candle[] = [];
  for (const [at, , quote, price] of pons.trades) {
    const time = Math.floor(at / MINUTE) * 60;
    const close = price * cap;
    const volume = ethPerQuote === null ? 0 : quote * ethPerQuote;
    const last = candles[candles.length - 1];
    if (last && time <= last.time) {
      last.high = Math.max(last.high, close);
      last.low = Math.min(last.low, close);
      last.close = close;
      last.volume += volume;
    } else {
      const open = previous * cap;
      candles.push({ time, open, high: Math.max(open, close), low: Math.min(open, close), close, volume });
    }
    previous = price;
  }
  return { candles, complete, volume: ethPerQuote !== null };
}
