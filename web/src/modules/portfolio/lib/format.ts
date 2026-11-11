import { formatPrice, formatUsd } from "@/shared/lib/format";

/** What every hidden figure shows. */
export const MASK = "••••";

const MINUS = "−";

/** A quantity: whole digits with separators, up to six decimals; a speck reads as "<0.000001". */
export function formatQuantity(value: number): string {
  if (value > 0 && value < 0.000001) return "<0.000001";
  return value.toLocaleString("en-US", { maximumFractionDigits: value >= 1000 ? 2 : 6 });
}

/** "+$89.93", "−$12.40". */
export const formatDelta = (value: number) => `${value < 0 ? MINUS : "+"}${formatUsd(Math.abs(value))}`;

/** "+2.40%", "−0.31%". */
export const formatPercent = (value: number) => `${value < 0 ? MINUS : "+"}${Math.abs(value).toFixed(2)}%`;

/** A dollar figure for the totals; a position worth under a cent still reads as something. */
export function formatValue(value: number): string {
  return value > 0 && value < 0.01 ? "<$0.01" : formatUsd(value);
}

export { formatPrice };

/** A share of the whole: "70.1%". */
export const formatShare = (part: number, whole: number) => `${(whole > 0 ? (part / whole) * 100 : 0).toFixed(1)}%`;
