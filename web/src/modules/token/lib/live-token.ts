import { isEvmAddress, isSolanaAddress, sameAddress } from "@/shared/lib/address";
import { CHART_TIMEFRAMES, type TokenDetail } from "@/shared/types/token-detail";

export type LiveTokenResult = { status: "ok"; detail: TokenDetail } | { status: "not-found" } | { status: "unavailable" };

const EVM = /^0x[\da-fA-F]{40}$/;

/** Accept only one EVM address or a base58-encoded 32-byte Solana public key. */
export function isTokenAddress(address: string): boolean {
  return isEvmAddress(address) || isSolanaAddress(address);
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || finite(value);
const nullableString = (value: unknown) => value === null || typeof value === "string";

/** Reject malformed responses and another token's data before it reaches this page. */
export function isLiveTokenDetail(value: unknown, address: string): value is TokenDetail {
  if (!record(value) || value.source !== "live" || !isTokenAddress(address)) return false;
  const { token, stats, chart, links } = value;
  if (!record(token) || !record(stats) || !record(chart) || !record(links)) return false;
  if (typeof token.address !== "string" || !sameAddress(token.address, address)) return false;
  if (typeof value.contract !== "string" || !sameAddress(value.contract, address)) return false;
  if (token.chain !== (EVM.test(address) ? "rh" : "sol")) return false;
  if (!["ticker", "name", "launchpad", "creator", "art", "level"].every((key) => typeof token[key] === "string")) return false;
  if (!["curve", "score", "change24h", "volume24h", "marketCap", "ageMinutes", "smartWallets"].every((key) => finite(token[key]))) return false;
  const flags = token.flags;
  if (!nullableNumber(token.holders) || !record(flags)) return false;
  if (!["hot", "og", "isNew", "locked", "agent"].every((key) => typeof flags[key] === "boolean") || !nullableString(flags.crew)) return false;
  if (!["priceUsd", "supply", "nativeUsd", "feePct"].every((key) => nullableNumber(value[key]))) return false;
  if (!["launchedAt", "updatedAt"].every((key) => finite(value[key]))) return false;
  if (!nullableString(value.description) || !nullableString(value.curve) || !nullableString(links.website) || !nullableString(links.community)) return false;
  if (!["txns24h", "liquidity", "holdersChange1h", "top10Share"].every((key) => nullableNumber(stats[key]))) return false;
  if (stats.liquidityIn !== "curve" && stats.liquidityIn !== "pool") return false;
  const { candles, marks } = chart;
  if (!record(candles) || !record(marks)) return false;
  if (!CHART_TIMEFRAMES.every((tf) => Array.isArray(candles[tf]) && Array.isArray(marks[tf]))) return false;
  if (!nullableNumber(chart.graduationCap) || (chart.callout !== null && !record(chart.callout))) return false;
  if (!["trades", "holders", "topTraders"].every((key) => Array.isArray(value[key]))) return false;
  if (!["devLock", "crew", "agent", "flow1h"].every((key) => value[key] === null || record(value[key]))) return false;
  return true;
}
