import { USDG, WETH } from "@/shared/swap/tokens";
import { NO_CHANGE, type PriceChange } from "../lib/types";
import { inChunks, numeric, record } from "./clean";

const BATCH = 30;
const PARALLEL = 4;
/** A price needs a real market: quoted in a coin we know, or a deep enough pool that a fake one would cost real money. */
const MIN_LIQUIDITY = 1_000;
const MIN_LIQUIDITY_OTHER_QUOTE = 10_000;
const QUOTES = new Set(["0x0000000000000000000000000000000000000000", WETH.toLowerCase(), USDG.toLowerCase()]);
const ART_HOST = "https://cdn.dexscreener.com/";
const PRICED_TTL = 30_000;
const UNKNOWN_TTL = 600_000;
const STALE_OK = 600_000;
const MAX_ENTRIES = 30_000;

export interface DexPrice {
  priceUsd: number;
  change: PriceChange;
  art: string;
}

interface Entry {
  price: DexPrice | null;
  at: number;
}

const store = new Map<string, Entry>();

/** For tests. */
export const clearDexPrices = () => store.clear();

/** The price of `address` from its deepest trustworthy pool on the chain, or null. */
export function bestPrice(pairs: readonly unknown[], address: string): DexPrice | null {
  const wanted = address.toLowerCase();
  let best: { depth: number; price: DexPrice } | null = null;
  for (const pair of pairs) {
    if (!record(pair) || !record(pair.baseToken) || !record(pair.quoteToken)) continue;
    if (String(pair.baseToken.address).toLowerCase() !== wanted) continue;
    const depth = (record(pair.liquidity) ? numeric(pair.liquidity.usd) : null) ?? 0;
    const known = QUOTES.has(String(pair.quoteToken.address).toLowerCase());
    if (depth < (known ? MIN_LIQUIDITY : MIN_LIQUIDITY_OTHER_QUOTE)) continue;
    const priceUsd = numeric(pair.priceUsd);
    if (priceUsd === null || priceUsd <= 0 || (best && best.depth >= depth)) continue;
    const moves = record(pair.priceChange) ? pair.priceChange : {};
    const image = record(pair.info) && typeof pair.info.imageUrl === "string" ? pair.info.imageUrl : "";
    best = {
      depth,
      price: { priceUsd, change: { ...NO_CHANGE, m5: numeric(moves.m5), h1: numeric(moves.h1), h6: numeric(moves.h6), h24: numeric(moves.h24) }, art: image.startsWith(ART_HOST) ? image : "" },
    };
  }
  return best?.price ?? null;
}

async function fetchBatch(addresses: readonly string[]): Promise<void> {
  const res = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${addresses.join(",")}`, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`DexScreener: HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error("DexScreener: bad response");
  const at = Date.now();
  if (store.size + addresses.length > MAX_ENTRIES) store.clear();
  for (const address of addresses) store.set(address.toLowerCase(), { price: bestPrice(body, address), at });
}

const fresh = (entry: Entry | undefined, now: number) => entry !== undefined && now - entry.at < (entry.price ? PRICED_TTL : UNKNOWN_TTL);

export interface DexPrices {
  /** By lowercase address. */
  prices: Map<string, DexPrice>;
  /** Some lookups failed and had no recent answer to fall back on. */
  failed: boolean;
}

/** USD prices and moves for Robinhood Chain tokens, from DexScreener, remembered per server instance. */
export async function readDexPrices(addresses: readonly string[]): Promise<DexPrices> {
  const unique = [...new Set(addresses.map((address) => address.toLowerCase()))];
  const needed = unique.filter((address) => !fresh(store.get(address), Date.now()));
  const batches = Array.from({ length: Math.ceil(needed.length / BATCH) }, (_, i) => needed.slice(i * BATCH, (i + 1) * BATCH));
  const results = await inChunks(batches, PARALLEL, fetchBatch);
  const failedLookup = results.some((result) => result.status === "rejected");
  const prices = new Map<string, DexPrice>();
  let missing = false;
  const read = Date.now();
  for (const address of unique) {
    const entry = store.get(address);
    if (!entry || (!fresh(entry, read) && read - entry.at >= STALE_OK)) missing = true;
    else if (entry.price) prices.set(address, entry.price);
  }
  return { prices, failed: failedLookup && missing };
}
