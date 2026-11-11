import type { LaunchpadId } from "@/shared/types/launchpad";
import { EMPTY_WINDOW, type MarketWindow, type MarketWindows, type WindowKey } from "../model";
import { NATIVE_ETH, USDG, WETH } from "./pons";

/**
 * DexScreener's free token endpoint: up to 30 addresses per call (about 300
 * calls a minute allowed). Only a launchpad's own pools are trusted: its
 * bonding curve, then the AMM it graduates to, quoted in SOL or a stablecoin.
 * Anything else (someone's side pool against a junk coin) is ignored, so a
 * fake pool can't give a token a fake price. Pons curves aren't listed; its
 * tokens are looked up here once they graduate to Uniswap v4.
 */
export const BATCH_SIZE = 30;
const KEYS: WindowKey[] = ["m5", "h1", "h6", "h24"];
const MINUTE = 60_000;

const QUOTES = new Set([
  "So11111111111111111111111111111111111111112", // SOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB", // USD1 (Bonk.fun)
  NATIVE_ETH, // Robinhood Chain
  WETH,
  USDG,
]);
const CURVE_DEXES: Partial<Record<LaunchpadId, readonly string[]>> = { pump: ["pumpfun"], bonk: ["launchlab"] };
const GRADUATION_DEXES: Partial<Record<LaunchpadId, readonly string[]>> = {
  pump: ["pumpswap"],
  bonk: ["raydium"],
  pons: ["uniswap"],
};

/** EVM addresses compare case-insensitively (DexScreener checksums them); Solana's are exact. */
const norm = (address: string) => (address.startsWith("0x") ? address.toLowerCase() : address);

export interface DexPair {
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string };
  quoteToken?: { address?: string };
  priceUsd?: string;
  priceNative?: string;
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  liquidity?: { usd?: number };
  volume?: Partial<Record<WindowKey, number>>;
  priceChange?: Partial<Record<WindowKey, number>>;
  txns?: Partial<Record<WindowKey, { buys?: number; sells?: number }>>;
}

export interface MarketData {
  priceUsd: number;
  priceNative: number;
  marketCap: number;
  /** USD held in the pool, or null when DexScreener doesn't say. */
  liquidityUsd: number | null;
  dexId: string;
  /** The pair's address, which GeckoTerminal knows the pool by (chart candles). */
  pool: string | null;
  /** The launchpad's bonding-curve pair, while DexScreener lists it. */
  curvePool: string | null;
  /** True while the token still trades on its launchpad's bonding curve. */
  onCurve: boolean;
  windows: MarketWindows;
}

/** What DexScreener says about one launch: data, nothing yet, or proof the launch was fake. */
export type MarketResult = MarketData | "invalid" | undefined;

const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN);
const safe = (v: number) => (Number.isFinite(v) ? v : 0);
const busiest = (pairs: readonly DexPair[]) =>
  pairs.reduce((best, p) => (safe(n(p.volume?.h24)) > safe(n(best.volume?.h24)) ? p : best));

/** The token's own pairs against a quote asset it can be trusted with. */
function ownPairs(pairs: readonly DexPair[], address: string, quote?: string): DexPair[] {
  const trusted = (q: string) => QUOTES.has(norm(q)) || (quote !== undefined && norm(q) === norm(quote));
  return pairs.filter((p) => norm(p.baseToken?.address ?? "") === norm(address) && trusted(p.quoteToken?.address ?? ""));
}

/** The launchpad's own bonding-curve pair (its address), when DexScreener lists it. */
export function curvePool(pairs: readonly DexPair[], address: string, launchpad: LaunchpadId, quote?: string): string | null {
  const curve = ownPairs(pairs, address, quote).filter((p) => CURVE_DEXES[launchpad]?.includes(p.dexId ?? ""));
  return curve.length > 0 ? busiest(curve).pairAddress ?? null : null;
}

/**
 * The launch's trusted pair: its graduation pool (opened after the launch),
 * else its bonding curve. "invalid" when the token already traded in real
 * pools well before the reported launch (a spoofed launch event). `quote` is
 * the launch's own quote asset (Pons pairs some launches with tokenized stocks).
 */
export function pickMainPair(
  pairs: readonly DexPair[],
  address: string,
  launchpad: LaunchpadId,
  launchedAt: number,
  quote?: string,
): { pair: DexPair; onCurve: boolean } | "invalid" | null {
  const own = ownPairs(pairs, address, quote);
  const graduated = own.filter(
    (p) => GRADUATION_DEXES[launchpad]?.includes(p.dexId ?? "") && (p.pairCreatedAt ?? 0) >= launchedAt - 10 * MINUTE,
  );
  if (graduated.length > 0) return { pair: busiest(graduated), onCurve: false };
  const curve = own.filter((p) => CURVE_DEXES[launchpad]?.includes(p.dexId ?? ""));
  if (curve.length > 0) return { pair: busiest(curve), onCurve: true };
  if (own.some((p) => (p.pairCreatedAt ?? Infinity) < launchedAt - 10 * MINUTE)) return "invalid";
  return null;
}

export function toMarketData(pair: DexPair, onCurve: boolean, curve: string | null = null): MarketData {
  const windows = Object.fromEntries(
    KEYS.map((key): [WindowKey, MarketWindow] => [
      key,
      {
        ...EMPTY_WINDOW,
        change: safe(n(pair.priceChange?.[key])),
        volume: safe(n(pair.volume?.[key])),
        buys: safe(n(pair.txns?.[key]?.buys)),
        sells: safe(n(pair.txns?.[key]?.sells)),
      },
    ]),
  ) as MarketWindows;
  return {
    priceUsd: safe(n(pair.priceUsd)),
    priceNative: safe(n(pair.priceNative)),
    marketCap: safe(n(pair.marketCap ?? pair.fdv)),
    liquidityUsd: Number.isFinite(n(pair.liquidity?.usd)) ? n(pair.liquidity?.usd) : null,
    dexId: pair.dexId ?? "",
    pool: pair.pairAddress ?? null,
    curvePool: curve,
    onCurve,
    windows,
  };
}

export interface MarketRequest {
  address: string;
  launchpad: LaunchpadId;
  launchedAt: number;
  /** The launch's quote asset, when it isn't one of the usual ones. */
  quote?: string;
}

/** Market results for up to 30 tokens on one chain ("solana" or "robinhood"). */
export async function fetchMarket(chain: "solana" | "robinhood", requests: readonly MarketRequest[]): Promise<Map<string, MarketResult>> {
  const out = new Map<string, MarketResult>();
  if (requests.length === 0) return out;
  const res = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${requests.map((r) => r.address).join(",")}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" },
  });
  if (res.status === 429) throw new RateLimitError();
  if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
  const pairs = (await res.json()) as DexPair[];
  if (!Array.isArray(pairs)) return out;
  for (const r of requests) {
    const main = pickMainPair(pairs, r.address, r.launchpad, r.launchedAt, r.quote);
    if (main === "invalid") out.set(r.address, "invalid");
    else out.set(r.address, main ? toMarketData(main.pair, main.onCurve, curvePool(pairs, r.address, r.launchpad, r.quote)) : undefined);
  }
  return out;
}

export class RateLimitError extends Error {
  constructor() {
    super("DexScreener rate limit");
  }
}
