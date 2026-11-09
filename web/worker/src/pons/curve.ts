import type { TradeBook } from "../trades/book";
import { emptyWindows, type MarketWindows, type WindowKey } from "../model";

/**
 * Pons V2's bonding curve: constant product over virtual reserves, starting at
 * 1B virtual tokens against 0.4 × the graduation amount in the quote asset.
 * Raising the graduation amount sells 5/7 of the supply and graduates the
 * token. Replaying real CurveBuy and CurveSell events through this keeps the
 * product exactly constant (see worker/tests/pons.test.ts).
 */
export const PONS_SUPPLY = 1_000_000_000;
const START_SHARE = 0.4;
const MINUTE = 60_000;
const SPANS: Record<WindowKey, number> = { m5: 5 * MINUTE, h1: 60 * MINUTE, h6: 360 * MINUTE, h24: 1_440 * MINUTE };

/** [time, 1 for a buy or 0 for a sell, quote amount, spot price after the trade] */
export type PonsTradeRecord = [number, 0 | 1, number, number];

export interface PonsState {
  curve: string;
  /** The quote asset (the zero address is native ETH). */
  quote: string;
  quoteDecimals: number;
  /** Quote amount that graduates the token. */
  threshold: number;
  /** The launch transaction; the creator's own buy rides along in it. */
  launchTx: string;
  virtualQuote: number;
  virtualTokens: number;
  /** The last day of trades, plus the one before it (it sets the 24h start price). */
  trades: PonsTradeRecord[];
  /** Wallet → whole tokens, from curve trades since launch (holders.ts); absent for tokens restored from older snapshots. */
  balances?: Record<string, number>;
  /** The first wallets to buy, in order (the creator included), up to EARLY_BUYERS + 1. */
  earlyBuyers?: string[];
  /** Latest curve trades and each wallet's totals, for the token's page; absent in older snapshots. */
  book?: TradeBook;
}

export function newPonsState(input: Pick<PonsState, "curve" | "quote" | "quoteDecimals" | "threshold" | "launchTx">): PonsState {
  return { ...input, virtualQuote: START_SHARE * input.threshold, virtualTokens: PONS_SUPPLY, trades: [], balances: {}, earlyBuyers: [] };
}

/** Quote per token right now. */
export function ponsSpot(s: PonsState): number {
  return s.virtualQuote / s.virtualTokens;
}

/** Share of the graduation amount raised so far, 0–1. */
export function ponsProgress(s: PonsState): number {
  return Math.min(1, Math.max(0, (s.virtualQuote - START_SHARE * s.threshold) / s.threshold));
}

export interface CurveTrade {
  buy: boolean;
  /** Quote paid in (buys) or received (sells), in whole units. */
  quote: number;
  tokens: number;
  fee: number;
  tax: number;
  at: number;
}

/** Moves the curve by one trade. The fee and the launch snipe tax are taken outside the curve. */
export function applyCurveTrade(s: PonsState, t: CurveTrade): void {
  if (t.buy) {
    s.virtualQuote += t.quote - t.fee - t.tax;
    s.virtualTokens -= t.tokens;
  } else {
    s.virtualQuote -= t.quote + t.fee + t.tax;
    s.virtualTokens += t.tokens;
  }
  s.trades.push([t.at, t.buy ? 1 : 0, t.quote, ponsSpot(s)]);
}

/** Drops trades older than a day, keeping the last one before that as the 24h start price. */
export function trimTrades(s: PonsState, now: number): void {
  const cutoff = now - SPANS.h24;
  const firstRecent = s.trades.findIndex(([at]) => at >= cutoff);
  const keepFrom = firstRecent === -1 ? s.trades.length - 1 : firstRecent - 1;
  if (keepFrom > 0) s.trades.splice(0, keepFrom);
}

/** Change, USD volume and trade counts per window, from the curve's own trades. */
export function ponsWindows(s: PonsState, quoteUsd: number, now: number): MarketWindows {
  const spot = ponsSpot(s);
  const out = emptyWindows();
  for (const key of Object.keys(SPANS) as WindowKey[]) {
    const since = now - SPANS[key];
    const w = out[key];
    let start = (START_SHARE * s.threshold) / PONS_SUPPLY;
    for (const [at, buy, quote, price] of s.trades) {
      if (at < since) {
        start = price;
        continue;
      }
      if (buy) w.buys += 1;
      else w.sells += 1;
      w.volume += quote * quoteUsd;
    }
    w.change = start > 0 ? (spot / start - 1) * 100 : 0;
  }
  return out;
}

/** Buys at or after `since`, counted from the trades themselves. */
export function ponsBuysSince(s: PonsState, since: number): number {
  return s.trades.reduce((count, [at, buy]) => count + (buy === 1 && at >= since ? 1 : 0), 0);
}
