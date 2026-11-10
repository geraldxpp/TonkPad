import { amountText, formatCompact, formatFull } from "@/shared/swap/amounts";

const DECIMALS = 18;
const raw = (wei: bigint) => ({ raw: wei.toString(), decimals: DECIMALS });

/** ETH for display: "0.255", "5.5918", "0.0000625" (four decimals from 1 up, four significant digits below). */
export function formatEth(wei: bigint): string {
  return formatFull(raw(wei));
}

/** ETH for tight spots: two decimals from 1 up ("17.58"), two significant digits below ("0.0044"). */
export function formatEthShort(wei: bigint): string {
  const value = Number(wei) / 1e18;
  return value >= 1 ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : value.toLocaleString("en-US", { maximumSignificantDigits: 2 });
}

/** A token count for tight spots: "42.1M", "33.68M", "800M". */
export function formatTokens(wei: bigint): string {
  return formatCompact(raw(wei));
}

/** A token count in full: "42,095,276.22". */
export function formatTokensFull(wei: bigint): string {
  return formatFull(raw(wei));
}

/** ETH as text for an amount box, exact and without trailing zeros: "0.0000625". */
export function ethInputText(wei: bigint): string {
  return amountText(wei.toString(), DECIMALS, DECIMALS);
}

/**
 * A typed ETH amount in wei. Empty and zero are 0 (no amount); anything that
 * isn't a plain decimal number is null.
 */
export function parseEthInput(text: string): bigint | null {
  const clean = text.trim().replace(",", ".");
  if (clean === "") return BigInt(0);
  if (!/^\d*\.?\d*$/.test(clean) || clean === ".") return null;
  const [whole = "", fraction = ""] = clean.split(".");
  if (fraction.length > DECIMALS) return null;
  return BigInt(whole || "0") * BigInt(10) ** BigInt(DECIMALS) + BigInt(fraction.padEnd(DECIMALS, "0") || "0");
}

/** Basis points as a percentage: 200 → "2.0%", 50 → "0.5%". */
export function bpsText(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

/** A plain percentage with two decimals: 4.2095 → "4.21%". */
export function percentText(value: number, places = 2): string {
  return `${value.toFixed(places)}%`;
}
