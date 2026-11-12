import { ALERT_LAUNCHPADS, type LiveLaunch, type LiveLaunches, type LivePrices, MAX_ALERT_IDS } from "@/shared/types/live";
import type { TrackedToken } from "../model";
import type { TokenStore } from "../store";
import { buysLast15m } from "../tokens";
import { HOT_BUYS } from "./list";
import { validTokenAddress } from "./token";

/** How many of tonkfun.fun's newest launches /v1/launches lists. */
export const LATEST_LAUNCHES = 20;
/** And per followed launchpad, how many recent graduations and how many hot launches. */
export const RECENT_PER_PAD = 20;
const HOUR = 60 * 60_000;
/** Graduations from the last two hours count as recent. */
export const RECENT_GRADUATION_MS = 2 * HOUR;
/** A hot launch is one launched within the hour. */
export const HOT_LAUNCH_MS = HOUR;

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

const isHot = (t: TrackedToken, now: number) => now - t.createdAt <= HOT_LAUNCH_MS && buysLast15m(t, now) >= HOT_BUYS;

function launchOf(t: TrackedToken, now: number): LiveLaunch {
  const s = t.tonk;
  const lock = s?.lock && s.lock.type !== "none" && s.lock.lockedBps > 0 ? s.lock : null;
  return {
    address: t.address,
    chain: t.chain,
    launchpad: t.launchpad,
    symbol: t.symbol,
    name: t.name,
    launchedAt: t.createdAt,
    graduatedAt: t.graduated ? t.graduatedAt ?? s?.launchTime ?? t.createdAt : null,
    lockEnd: lock ? lock.end * 1_000 : null,
    lockClaimed: lock ? lock.claimed : null,
    hot: isHot(t, now),
  };
}

const newest = (a: TrackedToken, b: TrackedToken) => b.createdAt - a.createdAt;

/**
 * Launches as they stand, for launchpad alerts: tonkfun.fun's newest, each
 * followed launchpad's graduations from the last two hours and its hot
 * launches, then the tokens asked for (watched ones, on any launchpad).
 */
export function launchesView(store: TokenStore, ids: readonly string[], now: number): LiveLaunches {
  const picked = new Map<string, TrackedToken>();
  const all = store.all();
  for (const t of all.filter((token) => token.tonk).sort(newest).slice(0, LATEST_LAUNCHES)) picked.set(t.address, t);
  for (const pad of ALERT_LAUNCHPADS) {
    const own = all.filter((t) => t.launchpad === pad);
    const graduated = own
      .filter((t) => t.graduated && (t.graduatedAt ?? 0) >= now - RECENT_GRADUATION_MS)
      .sort((a, b) => (b.graduatedAt ?? 0) - (a.graduatedAt ?? 0))
      .slice(0, RECENT_PER_PAD);
    const hot = own.filter((t) => isHot(t, now)).sort(newest).slice(0, RECENT_PER_PAD);
    for (const t of [...graduated, ...hot]) picked.set(t.address, t);
  }
  for (const t of lookup(store, ids)) picked.set(t.address, t);
  return { launches: [...picked.values()].map((t) => launchOf(t, now)) };
}
