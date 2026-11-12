import { type LiveLaunch, type LiveLaunches, type LivePrices, MAX_ALERT_IDS } from "@/shared/types/live";
import type { TrackedToken } from "../model";
import type { TokenStore } from "../store";
import { validTokenAddress } from "./token";

/** How many of the newest tonkfun.fun launches /v1/launches lists, besides those asked for. */
export const LATEST_LAUNCHES = 20;

/** The `ids` query: valid addresses, each once, at most MAX_ALERT_IDS. */
export function parseIds(raw: string | null): string[] {
  const ids = new Set<string>();
  for (const part of (raw ?? "").slice(0, 2_000).split(",")) {
    const id = part.trim();
    if (validTokenAddress(id)) ids.add(id);
    if (ids.size >= MAX_ALERT_IDS) break;
  }
  return [...ids];
}

/** Finds tokens by address; EVM addresses in any case. It never marks a token opened, so it costs no Helius credits. */
function lookup(store: TokenStore, ids: readonly string[]): TrackedToken[] {
  let evm: Map<string, TrackedToken> | null = null;
  const found: TrackedToken[] = [];
  for (const id of ids) {
    let token = store.get(id);
    if (!token && id.startsWith("0x")) {
      evm ??= new Map(store.all().filter((t) => t.chain === "rh").map((t) => [t.address.toLowerCase(), t]));
      token = evm.get(id.toLowerCase());
    }
    if (token) found.push(token);
  }
  return found;
}

/** Prices for alerts: tokens the worker tracks and has priced; any other address is left out. */
export function pricesView(store: TokenStore, ids: readonly string[]): LivePrices {
  const prices = lookup(store, ids)
    .filter((t) => t.marketAt > 0 && t.priceUsd > 0)
    .map((t) => ({
      address: t.address,
      chain: t.chain,
      symbol: t.symbol,
      name: t.name,
      priceUsd: t.priceUsd,
      marketCap: t.marketCap,
      change1h: t.windows.h1.change,
      change24h: t.windows.h24.change,
      at: t.marketAt,
    }));
  return { prices };
}

function launchOf(t: TrackedToken): LiveLaunch | null {
  const s = t.tonk;
  if (!s) return null;
  const locked = s.lock && s.lock.type !== "none" && s.lock.lockedBps > 0 ? s.lock : null;
  return {
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    launchedAt: t.createdAt,
    graduatedAt: t.graduated ? t.graduatedAt ?? s.launchTime : null,
    lockEnd: locked ? locked.end * 1_000 : null,
    lockClaimed: locked ? locked.claimed : null,
  };
}

/** tonkfun.fun's launches as they stand: the newest, then those asked for. Empty where the launchpad isn't followed. */
export function launchesView(store: TokenStore, ids: readonly string[]): LiveLaunches {
  const launches = store.all().filter((t) => t.tonk);
  const newest = [...launches].sort((a, b) => b.createdAt - a.createdAt).slice(0, LATEST_LAUNCHES);
  const picked = new Map(newest.map((t) => [t.address, t]));
  for (const t of lookup(store, ids)) if (t.tonk) picked.set(t.address, t);
  return { launches: [...picked.values()].map(launchOf).filter((l): l is LiveLaunch => l !== null) };
}
