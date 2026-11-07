/**
 * Blockscout's PRO API for Robinhood Chain (chain 4663), with the owner's free
 * key: a token's holder count (30 credits) and its 50 largest holders (20
 * credits), for Pons tokens after they graduate, when their trading moves to
 * Uniswap and out of the curve's sight. The free plan allows 100K credits a
 * day. Field names follow Blockscout's API v2; older and newer spellings are
 * both read.
 */
const BASE = "https://api.blockscout.com/4663/api/v2";
export const INFO_CREDITS = 30;
export const HOLDERS_CREDITS = 20;

export interface ChainHolders {
  count: number | null;
  /** Share of supply the 10 largest wallets hold, 0–1 (contracts such as pools and lockers left out). */
  top10Share: number | null;
  /** Wallets among the largest holders, biggest first, lowercase. */
  wallets: string[];
}

type Raw = Record<string, unknown>;
const record = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const num = (v: unknown): number | null => {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function parseTokenInfo(raw: unknown): { count: number | null; supply: number | null } {
  const r = record(raw);
  return { count: num(r.holders_count ?? r.holders), supply: num(r.total_supply) };
}

export interface ChainHolder {
  address: string;
  contract: boolean;
  /** Raw units. */
  value: number;
}

export function parseHolders(raw: unknown): ChainHolder[] {
  const items = record(raw).items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item): ChainHolder[] => {
    const i = record(item);
    const a = record(i.address);
    const hash = typeof a.hash === "string" ? a.hash : typeof i.address_hash === "string" ? i.address_hash : null;
    const value = num(i.value);
    if (!hash || value === null) return [];
    return [{ address: hash.toLowerCase(), contract: a.is_contract === true || i.is_contract === true, value }];
  });
}

export function summarize(count: number | null, supply: number | null, holders: readonly ChainHolder[]): ChainHolders {
  const wallets = holders.filter((h) => !h.contract).sort((a, b) => b.value - a.value);
  const top10 = wallets.slice(0, 10).reduce((sum, h) => sum + h.value, 0);
  return {
    count,
    top10Share: supply && supply > 0 ? Math.min(1, top10 / supply) : null,
    wallets: wallets.map((h) => h.address),
  };
}

async function get(apiKey: string, path: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${path}?apikey=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(15_000) });
  // The URL carries the key, so errors name only the status.
  if (!res.ok) throw new Error(`Blockscout HTTP ${res.status}`);
  return res.json();
}

/** A token's holder count and largest wallets; `onCredits` runs with each call's cost. */
export async function fetchChainHolders(apiKey: string, token: string, onCredits: (credits: number) => void): Promise<ChainHolders> {
  onCredits(INFO_CREDITS);
  const info = parseTokenInfo(await get(apiKey, `tokens/${token}`));
  onCredits(HOLDERS_CREDITS);
  const holders = parseHolders(await get(apiKey, `tokens/${token}/holders`));
  return summarize(info.count, info.supply, holders);
}
