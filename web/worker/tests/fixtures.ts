import { EMPTY_WINDOW, type MarketWindow, type MarketWindows, newTrackedToken, type TrackedToken, type WindowKey } from "../src/model";

/** A fixed "now" for every worker test: 6 Nov 2026, 12:00 UTC. */
export const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
export const SEC = 1_000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;

/** A 44-character address, so searches treat it like a real one. */
export function address(label: string): string {
  return label.padEnd(44, "1");
}

let serial = 0;

/** A tracked Pump.fun token launched `ageMs` before NOW, with any fields overridden. */
export function tracked(overrides: Partial<TrackedToken> = {}, ageMs = 30 * MIN): TrackedToken {
  serial += 1;
  const base = newTrackedToken(
    {
      address: address(`Mint${serial}`),
      chain: "sol",
      launchpad: "pump",
      name: `Token ${serial}`,
      symbol: `TK${serial}`,
      creator: address("Creator"),
      createdAt: NOW - ageMs,
      creatorBuyShare: 0,
      marketCapNative: 30,
    },
    90,
  );
  return { ...base, ...overrides };
}

/** Market windows with only the given figures set. */
export function windows(patch: Partial<Record<WindowKey, Partial<MarketWindow>>>): MarketWindows {
  const out = {} as MarketWindows;
  for (const key of ["m5", "h1", "h6", "h24"] as const) out[key] = { ...EMPTY_WINDOW, ...patch[key] };
  return out;
}

/** A token with market data: priced at NOW, with the given market cap and windows. */
export function priced(marketCap: number, w: Partial<Record<WindowKey, Partial<MarketWindow>>>, overrides: Partial<TrackedToken> = {}, ageMs = 30 * MIN) {
  return tracked({ marketCap, windows: windows(w), marketAt: NOW, ...overrides }, ageMs);
}
