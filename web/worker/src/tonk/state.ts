import { tokenPrice } from "@/shared/tonk/curve";
import type { MissionLockJson } from "@/shared/tonk/mission";
import { emptyWindows, type MarketWindows, type WindowKey } from "../model";

/**
 * A tonkfun.fun launch as the feed follows it, from the launchpad's events
 * since its deployment block: the curve after each trade, then its own
 * Uniswap pool after graduation, and every holder's exact balance from the
 * token's Transfer events. Wei amounts are decimal strings, so the snapshot
 * stays plain JSON; prices are ETH per whole token.
 */
export interface TonkState {
  launchTx: string;
  /** The launch's block (Robinhood Chain's own, as the contract's shield counts it) and time, unix seconds. */
  launchBlock: number;
  launchTime: number;
  crewBps: number;
  creatorBps: number;
  /** Tokens the creator bought inside the launch, wei ("0" without a dev buy). */
  devBought: string;
  /** The dev lock as the launchpad stores it (devLocks and devVestedCheckpoint), or null without one. */
  lock: MissionLockJson | null;
  /** The curve after its latest trade: virtual reserves, tokens left to sell and the ETH really held. */
  virtualEth: string;
  virtualTokens: string;
  tokensLeft: string;
  realEth: string;
  /** The price the curve opened at, and the latest one (the pool's after graduation). */
  startPrice: number;
  spot: number;
  /** The last day of trades, curve and pool, plus the one before it (it sets the 24h start price). */
  trades: TonkTradeRecord[];
  /** Once graduated: the pool the migrator seeded, by its id from the migrator's own poolKey(token, fee). */
  pool: { id: string; fee: number } | null;
  /** The token has an agent brief stored (its agentPrompt reads as one). */
  agent: boolean;
  /** Every address's balance in wei, system addresses included, from the token's Transfer events. */
  balances: Record<string, string>;
  /** The balances changed since the holder figures were last worked out. */
  holdersDirty?: boolean;
}

/** [ms, 1 for a buy or 0 for a sell, gross ETH, ETH per token just after] */
export type TonkTradeRecord = [number, 0 | 1, number, number];

/** Whole tokens: 1 billion, fixed at launch. */
export const SUPPLY = 1_000_000_000;
const MINUTE = 60_000;
const SPANS: Record<WindowKey, number> = { m5: 5 * MINUTE, h1: 60 * MINUTE, h6: 360 * MINUTE, h24: 1_440 * MINUTE };

export const wei = (value: string) => BigInt(value);
export const ethOf = (value: bigint) => Number(value) / 1e18;

/** ETH per token on the curve, from its virtual reserves (the contract's own maths, rounded only to show). */
export const curvePrice = (virtualEth: bigint, virtualTokens: bigint) => (virtualTokens > BigInt(0) ? tokenPrice(virtualEth, virtualTokens) : 0);

/** ETH per token in the pool: currency0 is ETH and currency1 the token, so sqrtPriceX96² / 2¹⁹² is tokens per ETH. */
export function poolPrice(sqrtPriceX96: bigint): number {
  const root = Number(sqrtPriceX96) / 2 ** 96;
  return root > 0 ? 1 / (root * root) : 0;
}

export function recordTrade(s: TonkState, at: number, buy: boolean, eth: number, spot: number): void {
  s.spot = spot;
  s.trades.push([at, buy ? 1 : 0, eth, spot]);
}

/** Drops trades older than a day, keeping the last one before that as the 24h start price. */
export function trimTrades(s: TonkState, now: number): void {
  const cutoff = now - SPANS.h24;
  const firstRecent = s.trades.findIndex(([at]) => at >= cutoff);
  const keepFrom = firstRecent === -1 ? s.trades.length - 1 : firstRecent - 1;
  if (keepFrom > 0) s.trades.splice(0, keepFrom);
}

/** Change, USD volume and trade counts per window, at the ETH price now. */
export function tonkWindows(s: TonkState, ethUsd: number, now: number): MarketWindows {
  const out = emptyWindows();
  for (const key of Object.keys(SPANS) as WindowKey[]) {
    const since = now - SPANS[key];
    const w = out[key];
    let start = s.startPrice;
    for (const [at, buy, eth, price] of s.trades) {
      if (at < since) {
        start = price;
        continue;
      }
      if (buy) w.buys += 1;
      else w.sells += 1;
      w.volume += eth * ethUsd;
    }
    w.change = start > 0 ? (s.spot / start - 1) * 100 : 0;
  }
  return out;
}

/** Buys at or after `since`, counted from the trades themselves. */
export const buysSince = (s: TonkState, since: number) => s.trades.reduce((count, [at, buy]) => count + (buy === 1 && at >= since ? 1 : 0), 0);
