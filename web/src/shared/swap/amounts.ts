import { floorUnits, type RawAmount, toUnits } from "@/shared/wallet/units";

const TEN = BigInt(10);

/**
 * A typed amount into base units: "0.05" with 9 decimals → "50000000".
 * Accepts digits with one optional "." (or ","); decimals past the token's
 * own are dropped. Null for anything else, or for nothing to trade (zero).
 */
export function parseAmount(text: string, decimals: number): string | null {
  const clean = text.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return null;
  const [whole = "", fraction = ""] = clean.split(".");
  const cut = fraction.slice(0, decimals).padEnd(decimals, "0");
  const raw = BigInt(whole || "0") * TEN ** BigInt(decimals) + BigInt(cut || "0");
  return raw > BigInt(0) ? raw.toString() : null;
}

/** Base units back into text for the amount box: ("50000000", 9) → "0.05", up to `places` decimals, never rounded up. */
export function amountText(raw: string, decimals: number, places = 6): string {
  return floorUnits({ raw, decimals }, 0, Math.min(places, decimals));
}

const COMPACT = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
] as const;

/** Short form for tight spots: 2857989.69 → "2.86M", 0.05 → "0.05", 0.0000582 → "0.0000582". */
export function formatCompact(amount: RawAmount): string {
  const value = toUnits(amount);
  for (const [size, suffix] of COMPACT) {
    if (value >= size) return `${(value / size).toFixed(2).replace(/\.?0+$/, "")}${suffix}`;
  }
  return formatFull(amount);
}

/** Full form for the boxes: 2857989.69 → "2,857,989.69"; small values keep four significant digits. */
export function formatFull(amount: RawAmount): string {
  const value = toUnits(amount);
  if (value === 0) return "0";
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: value >= 1000 ? 2 : 4 });
  return value.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

/** USD for the boxes: "$170.60", "<$0.01", or null when unknown. */
export function formatUsdValue(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value > 0 && value < 0.01) return "<$0.01";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** What a native coin's Max leaves behind for network fees: 0.01 SOL, 0.0005 ETH. */
export const FEE_RESERVE: Record<"sol" | "rh", bigint> = { sol: BigInt(10_000_000), rh: BigInt(500_000_000_000_000) };

/**
 * A balance preset in base units: 25%, 50% or Max (100). For the chain's
 * own coin, Max keeps the fee reserve back so the swap can still pay its
 * network fee. Null when nothing is left to trade.
 */
export function presetAmount(balance: string, pct: number, reserve = BigInt(0)): string | null {
  const total = BigInt(balance);
  const spendable = pct === 100 ? total - reserve : (total * BigInt(pct)) / BigInt(100);
  return spendable > BigInt(0) ? spendable.toString() : null;
}

/** "1 SOL = 85.96 USDC": how much of the output one whole input buys, from a quote's amounts. */
export function unitRate(inAmount: RawAmount, outAmount: RawAmount): RawAmount | null {
  const input = BigInt(inAmount.raw);
  if (input === BigInt(0)) return null;
  const raw = (BigInt(outAmount.raw) * TEN ** BigInt(inAmount.decimals)) / input;
  return { raw: raw.toString(), decimals: outAmount.decimals };
}
