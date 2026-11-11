import type { ChainId } from "@/shared/types/chain";
import type { LaunchpadId } from "@/shared/types/launchpad";
import type { IssuerId } from "./issuers";
import type { PonsState } from "./pons/curve";
import type { StreamLock } from "./sources/streamflow";

/** DexScreener's windows; the list toolbar's 5m / 1h / 6h / 24h map onto them. */
export type WindowKey = "m5" | "h1" | "h6" | "h24";

export interface MarketWindow {
  /** Price change in percent. */
  change: number;
  /** Volume in USD. */
  volume: number;
  buys: number;
  sells: number;
}

export type MarketWindows = Record<WindowKey, MarketWindow>;

export const EMPTY_WINDOW: MarketWindow = { change: 0, volume: 0, buys: 0, sells: 0 };

export function emptyWindows(): MarketWindows {
  return { m5: { ...EMPTY_WINDOW }, h1: { ...EMPTY_WINDOW }, h6: { ...EMPTY_WINDOW }, h24: { ...EMPTY_WINDOW } };
}

/** Everything the worker knows about one token. */
export interface TrackedToken {
  address: string;
  chain: ChainId;
  launchpad: LaunchpadId;
  name: string;
  symbol: string;
  creator: string;
  /** Launch time, ms since epoch. */
  createdAt: number;
  /** Share of supply the creator bought at launch, 0–1. */
  creatorBuyShare: number;

  // Market data (DexScreener, or the launch event before the first refresh).
  priceUsd: number;
  marketCap: number;
  /** USD in the token's main pool (DexScreener); absent in older snapshots and for Pons curves. */
  liquidityUsd?: number | null;
  windows: MarketWindows;
  /** When market data last arrived, ms; 0 before the first refresh. */
  marketAt: number;
  dexId: string | null;
  /** The trusted DexScreener pair's address (GeckoTerminal finds the pool's candles by it); absent in older snapshots. */
  pool?: string | null;
  /** The launchpad's bonding-curve pair, kept after graduation so the chart can show the curve's trades. */
  curvePool?: string | null;

  // Bonding curve.
  curve: number;
  graduated: boolean;
  graduatedAt: number | null;

  // Metadata and safety facts (Helius).
  image: string | null;
  mintRevoked: boolean | null;
  freezeRevoked: boolean | null;
  assetAt: number;
  /** Total supply in raw units (Helius), when known. */
  supply?: number | null;
  /** Token decimals, so raw supply and balances can be displayed in whole units. */
  decimals?: number | null;
  /** Largest measured wallet balances in raw units; absent in older snapshots. */
  holderBalances?: Array<{ owner: string; amount: number }>;

  // Mission score v2 facts (safety.ts).
  /** An issuer whose mint and freeze authorities the token carries, before Jupiter confirms it. */
  issuerClaim?: IssuerId | null;
  /** The confirmed issuer of a tokenized stock or RWA. */
  issuer?: IssuerId | null;
  /** When Jupiter was last asked about the claim, ms. */
  issuerCheckedAt?: number;
  /** Share of supply the 10 largest wallets hold, 0–1 (Solana tokens on screen worth $20K+). */
  top10Share?: number | null;
  /** When the top-10 share was last measured, ms. */
  holdersAt?: number;
  /** Wallets holding the token: Jupiter's count on Solana, curve trades on Pons (shown in the Holders column). */
  holderCount?: number | null;
  /** When Jupiter last gave the count, ms (Solana). */
  holderCountAt?: number;
  /** The largest wallets from the last holder check, biggest first (Solana; smart money counts them). */
  topWallets?: string[];
  /** Smart-money wallets holding the token (smart/sweep.ts). */
  smartCount?: number;
  /** A Solana graduate's largest wallets, read soon after it graduated; they earn credit if it holds up. */
  graduationWallets?: string[];
  /** Streamflow locks of the token's supply among its largest holders (locks.ts). */
  locks?: StreamLock[];
  /** The creator wallet's balance at the last holder check, raw units (0 when outside the 20 largest). */
  creatorHeld?: number;
  /** tonkfun.fun launches: the Crew Rewards fee on every curve trade, in basis points (0 or 100–400). */
  crewBps?: number;

  // Short histories for the sparkline and buy velocity.
  /** [time, market cap], oldest first, thinned as it grows. */
  mcapSeries: Array<[number, number]>;
  /** [time, buys in DexScreener's 24h window], last ~30 minutes. */
  buySamples: Array<[number, number]>;

  /** When the next DexScreener refresh is due, ms (NOT_ON_DEXSCREENER for Pons curves). */
  nextRefreshAt: number;
  /** Pons tokens: their bonding curve, priced from its own trades until they graduate. */
  pons?: PonsState;
}

/** Pons curves aren't on DexScreener; their tokens are only looked up there once they graduate. */
export const NOT_ON_DEXSCREENER = Number.MAX_SAFE_INTEGER;

/** A launch as reported by a launchpad feed. */
export interface LaunchEvent {
  address: string;
  chain: ChainId;
  launchpad: LaunchpadId;
  name: string;
  symbol: string;
  creator: string;
  createdAt: number;
  creatorBuyShare: number;
  /** Market cap in the chain's native coin at launch, when the feed gives it. */
  marketCapNative: number | null;
}

export interface GraduationEvent {
  address: string;
  at: number;
}

export function newTrackedToken(launch: LaunchEvent, nativeUsd: number | null): TrackedToken {
  const marketCap = launch.marketCapNative !== null && nativeUsd !== null ? launch.marketCapNative * nativeUsd : 0;
  return {
    ...launch,
    priceUsd: marketCap / 1e9,
    marketCap,
    windows: emptyWindows(),
    marketAt: 0,
    dexId: null,
    curve: 0,
    graduated: false,
    graduatedAt: null,
    image: null,
    mintRevoked: null,
    freezeRevoked: null,
    assetAt: 0,
    mcapSeries: marketCap > 0 ? [[launch.createdAt, marketCap]] : [],
    buySamples: [],
    nextRefreshAt: launch.createdAt + 5_000,
  };
}

/** "GaWkukPjMKDyphGq6vMu4f1DmoWqv4jv5s9GyLTpo2FN" → "GaWk…o2FN" */
/** A token name as the app shows it: trimmed, at most 48 characters. */
export function cleanName(value: string): string {
  return value.trim().slice(0, 48);
}

/** A ticker as the app shows it: no leading $, at most 16 characters. */
export function cleanSymbol(value: string): string {
  return value.trim().replace(/^\$/, "").trim().slice(0, 16);
}

export function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}
