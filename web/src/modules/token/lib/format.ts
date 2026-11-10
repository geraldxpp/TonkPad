import { formatInteger, formatUsdCompact } from "@/shared/lib/format";
import { coinAmount, MONEY_UNIT } from "./money";

/** Token amounts as the export shows them: "3.13M", "784K", "15.7M". */
export function formatAmount(value: number): string {
  return formatUsdCompact(value).replace("$", "");
}

/** Holder balances keep one decimal on millions ("580.0M", "29.4M"). */
export function formatHolding(value: number): string {
  return value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : formatAmount(value);
}

/** Coin amounts: "0.0535" in the trades, "8.4" for liquidity. */
export function formatCoin(value: number, decimals = 4): string {
  // Test amounts are a thousand times smaller than the real ones: four fixed decimals would show them as zero.
  return MONEY_UNIT ? coinAmount(value) : value.toFixed(decimals);
}

/** Coin balances such as liquidity: "8.4" ETH, "0.35" SOL, "1,240" SOL. */
export function formatNative(value: number): string {
  if (MONEY_UNIT) return coinAmount(value);
  if (value >= 100) return formatInteger(value);
  return value.toFixed(value >= 1 ? 1 : 2);
}

/** Whole-number changes with their sign: "+96", "−12". */
export function formatSigned(value: number): string {
  return `${value < 0 ? "−" : "+"}${formatInteger(Math.abs(value))}`;
}

/** Seconds → "2s", "14m", "3h", "2d" (the trades' "… ago"). */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

export { shortAddress } from "@/shared/lib/address";

/** Whole days between two times in ms. */
export function daysBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

/** "Oct 18" in the page's language (UTC, so mock and server agree). */
export function formatDay(ms: number, lang: string): string {
  return new Intl.DateTimeFormat(lang, { month: "short", day: "numeric", timeZone: "UTC" }).format(ms);
}

/** "Oct 18, 2026": a date far enough off to need its year (a lock's end). */
export function formatDate(ms: number, lang: string): string {
  return new Intl.DateTimeFormat(lang, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(ms);
}

/** "Oct 18 · 14:22" */
export function formatDayTime(ms: number, lang: string): string {
  const time = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(ms);
  return `${formatDay(ms, lang)} · ${time}`;
}

/** The chain's coin. */
export const coinOf = (chain: "sol" | "rh") => (chain === "sol" ? "SOL" : (MONEY_UNIT ?? "ETH"));
