import type { LiveLaunch, LivePrice } from "@/shared/types/live";
import { MAX_TEXT } from "./storage";

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : NaN);
const text = (value: unknown): string => (typeof value === "string" ? value.slice(0, MAX_TEXT) : "");
const time = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const rows = (body: unknown, key: string): unknown[] => {
  const value = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : null;
  return Array.isArray(value) ? value.slice(0, 50) : [];
};

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`alerts: HTTP ${res.status}`);
  return res.json();
}

const query = (ids: readonly string[]) => (ids.length > 0 ? `?ids=${ids.map(encodeURIComponent).join(",")}` : "");

/** Prices for the tokens alerts watch (/api/live/prices); malformed rows are dropped. */
export async function fetchPrices(ids: readonly string[]): Promise<LivePrice[]> {
  return rows(await getJson(`/api/live/prices${query(ids)}`), "prices").flatMap((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const price: LivePrice = {
      address: typeof r.address === "string" ? r.address : "",
      chain: r.chain === "rh" ? "rh" : "sol",
      symbol: text(r.symbol),
      name: text(r.name),
      priceUsd: num(r.priceUsd),
      marketCap: num(r.marketCap),
      change1h: num(r.change1h),
      change24h: num(r.change24h),
      at: num(r.at),
    };
    return price.address && [price.priceUsd, price.marketCap, price.change1h, price.change24h].every(Number.isFinite) ? [price] : [];
  });
}

/** tonkfun.fun's launches as they stand (/api/live/launches); malformed rows are dropped. */
export async function fetchLaunches(ids: readonly string[]): Promise<LiveLaunch[]> {
  return rows(await getJson(`/api/live/launches${query(ids)}`), "launches").flatMap((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const launchedAt = time(r.launchedAt);
    if (typeof r.address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(r.address) || launchedAt === null) return [];
    const claimed = typeof r.lockClaimed === "string" && /^\d{1,78}$/.test(r.lockClaimed) ? r.lockClaimed : null;
    return [{ address: r.address, symbol: text(r.symbol), name: text(r.name), launchedAt, graduatedAt: time(r.graduatedAt), lockEnd: time(r.lockEnd), lockClaimed: claimed }];
  });
}
