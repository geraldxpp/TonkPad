import { artUrl } from "@/shared/lib/token-art";
import { NO_CHANGE, type PriceChange } from "../lib/types";
import { cleanName, cleanSymbol, inChunks, numeric, record } from "./clean";

const SEARCH = "https://api.jup.ag/tokens/v2/search";
/** Mints per request, and requests at once. */
const BATCH = 100;
const PARALLEL = 4;
/**
 * A price needs a real market behind it: anyone can mint a token, seed a
 * tiny pool and print a huge "value" on every wallet they airdrop it to.
 */
const MIN_LIQUIDITY = 1_000;
/** Prices move; a token with no market rarely gets one, so it isn't asked about again for a while. */
const PRICED_TTL = 30_000;
const UNKNOWN_TTL = 3_600_000;
/** When Jupiter can't be reached, a price this recent is still shown. */
const STALE_OK = 600_000;
const MAX_ENTRIES = 30_000;

export interface SolanaTokenInfo {
  symbol: string;
  name: string;
  art: string;
  priceUsd: number | null;
  change: PriceChange;
}

interface Entry {
  info: SolanaTokenInfo | null;
  at: number;
}

const store = new Map<string, Entry>();

/** For tests. */
export const clearSolanaTokens = () => store.clear();

const windowChange = (stats: unknown) => (record(stats) ? numeric(stats.priceChange) : null);

/** One result of Jupiter's token search, or null when it isn't one. */
export function parseJupiterToken(raw: unknown): (SolanaTokenInfo & { id: string }) | null {
  if (!record(raw) || typeof raw.id !== "string") return null;
  const price = numeric(raw.usdPrice);
  const liquidity = numeric(raw.liquidity);
  const suspicious = record(raw.audit) && raw.audit.isSus === true && raw.isVerified !== true;
  const reliable = price !== null && price > 0 && liquidity !== null && liquidity >= MIN_LIQUIDITY && !suspicious;
  return {
    id: raw.id,
    symbol: cleanSymbol(raw.symbol, raw.id),
    name: cleanName(raw.name, raw.id),
    art: typeof raw.icon === "string" ? (artUrl(raw.icon) ?? "") : "",
    priceUsd: reliable ? price : null,
    change: reliable ? { m5: windowChange(raw.stats5m), h1: windowChange(raw.stats1h), h6: windowChange(raw.stats6h), h24: windowChange(raw.stats24h) } : NO_CHANGE,
  };
}

async function fetchBatch(apiKey: string, mints: readonly string[]): Promise<void> {
  const res = await fetch(`${SEARCH}?query=${mints.join(",")}`, { headers: { "x-api-key": apiKey }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Jupiter tokens: HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error("Jupiter tokens: bad response");
  const at = Date.now();
  const found = new Map(body.map(parseJupiterToken).flatMap((token) => (token ? [[token.id, token] as const] : [])));
  if (store.size + mints.length > MAX_ENTRIES) store.clear();
  // A mint Jupiter doesn't list is remembered too, so a wallet full of junk costs one lookup.
  for (const mint of mints) store.set(mint, { info: found.get(mint) ?? null, at });
}

const fresh = (entry: Entry | undefined, now: number) => entry !== undefined && now - entry.at < (entry.info?.priceUsd ? PRICED_TTL : UNKNOWN_TTL);

export interface SolanaTokens {
  tokens: Map<string, SolanaTokenInfo>;
  /** Some lookups failed and had no recent answer to fall back on. */
  failed: boolean;
}

/** Name, art, price and price moves for each mint, from Jupiter, remembered per server instance. */
export async function readSolanaTokens(mints: readonly string[]): Promise<SolanaTokens> {
  const apiKey = process.env.JUPITER_API_KEY?.trim();
  const now = Date.now();
  const unique = [...new Set(mints)];
  const needed = unique.filter((mint) => !fresh(store.get(mint), now));
  let failed = false;
  if (needed.length > 0) {
    if (apiKey) {
      const batches = Array.from({ length: Math.ceil(needed.length / BATCH) }, (_, i) => needed.slice(i * BATCH, (i + 1) * BATCH));
      failed = (await inChunks(batches, PARALLEL, (batch) => fetchBatch(apiKey, batch))).some((result) => result.status === "rejected");
    } else failed = true;
  }
  const tokens = new Map<string, SolanaTokenInfo>();
  let missing = false;
  const read = Date.now();
  for (const mint of unique) {
    const entry = store.get(mint);
    if (!entry || (!fresh(entry, read) && read - entry.at >= STALE_OK)) missing = true;
    else if (entry.info) tokens.set(mint, entry.info);
  }
  return { tokens, failed: failed && missing };
}
