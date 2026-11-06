import type { TrackedToken } from "./model";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/**
 * How long until a token's market data is refreshed again. New and busy
 * tokens refresh every few seconds; quiet ones slowly, which keeps the
 * DexScreener calls well under its rate limit.
 */
export function refreshDelay(token: TrackedToken, now: number): number {
  const age = now - token.createdAt;
  const h1 = token.windows.h1;
  const active = h1.buys + h1.sells > 0;
  if (age < 10 * MINUTE) return 8 * SECOND;
  if (age < 60 * MINUTE) return active ? 15 * SECOND : MINUTE;
  if (active && token.marketCap >= 10_000) return 30 * SECOND;
  if (active) return 2 * MINUTE;
  return token.marketCap >= 20_000 ? 5 * MINUTE : 20 * MINUTE;
}
