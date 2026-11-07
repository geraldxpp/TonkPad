import type { LiveTimeframe } from "@/shared/types/live";
import type { SparkSeed, Token } from "@/shared/types/token";
import { ISSUERS } from "./issuers";
import { type MarketWindow, shortAddress, type TrackedToken, type WindowKey } from "./model";
import { ponsBuysSince } from "./pons/curve";
import { missionScore } from "./score";

const MINUTE = 60_000;

export const TF_WINDOW: Record<LiveTimeframe, WindowKey> = { "5m": "m5", "1h": "h1", "6h": "h6", "24h": "h24" };

export function windowFor(token: TrackedToken, tf: LiveTimeframe): MarketWindow {
  return token.windows[TF_WINDOW[tf]];
}

/**
 * Buys in the last 15 minutes. DexScreener counts buys per 24h, so the worker
 * keeps samples of that count and subtracts the one from 15 minutes ago.
 * Younger tokens: every buy so far. No old-enough sample yet: estimated from
 * the 5-minute and 1-hour counts.
 */
export function buysLast15m(token: TrackedToken, now: number): number {
  // Pons curves are followed trade by trade, so their count is exact.
  if (token.pons && !token.graduated) return ponsBuysSince(token.pons, now - 15 * MINUTE);
  const current = token.windows.h24.buys;
  if (now - token.createdAt <= 15 * MINUTE) return current;
  const cutoff = now - 15 * MINUTE;
  let past: number | null = null;
  for (const [at, buys] of token.buySamples) {
    if (at <= cutoff) past = buys;
    else break;
  }
  if (past !== null) return Math.max(0, current - past);
  return Math.round(Math.max(token.windows.m5.buys * 3, token.windows.h1.buys / 4));
}

/** 26 evenly timed points across the token's market-cap history (step-sampled). */
export function sampleSeries(series: ReadonlyArray<readonly [number, number]>, points = 26): number[] {
  if (series.length < 2) return [];
  const start = series[0][0];
  const end = series[series.length - 1][0];
  if (end <= start) return [];
  const out: number[] = [];
  let i = 0;
  for (let p = 0; p < points; p++) {
    const t = start + ((end - start) * p) / (points - 1);
    while (i + 1 < series.length && series[i + 1][0] <= t) i++;
    out.push(series[i][1]);
  }
  return out;
}

/** A stable seed per address, for the rare token without a market-cap history yet. */
function seedFor(address: string): SparkSeed {
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  return { seed: hash % 1000, drift: 0, vol: 0.1 };
}

/** The app's Token for a tracked token at time `now`. */
export function toToken(token: TrackedToken, now: number, hot = false): Token {
  const ageMinutes = Math.max(0, (now - token.createdAt) / MINUTE);
  const { score, level } = missionScore(token, now);
  const w = token.windows;
  return {
    address: token.address,
    ticker: token.symbol || "???",
    name: token.name || token.symbol || shortAddress(token.address),
    chain: token.chain,
    launchpad: token.launchpad,
    curve: token.graduated ? 1 : token.curve,
    score,
    level,
    spark: seedFor(token.address),
    series: sampleSeries(token.mcapSeries),
    change24h: w.h24.change,
    volume24h: w.h24.volume,
    windows: {
      "5m": { change: w.m5.change, volume: w.m5.volume },
      "1h": { change: w.h1.change, volume: w.h1.volume },
      "6h": { change: w.h6.change, volume: w.h6.volume },
      "24h": { change: w.h24.change, volume: w.h24.volume },
    },
    holders: null,
    smartWallets: 0,
    marketCap: token.marketCap,
    flags: { hot, og: false, isNew: ageMinutes < 30, locked: false, crew: null, agent: false },
    creator: shortAddress(token.creator),
    ageMinutes,
    art: token.image ?? "",
    ...(token.issuer ? { issuer: ISSUERS[token.issuer].name } : {}),
  };
}
