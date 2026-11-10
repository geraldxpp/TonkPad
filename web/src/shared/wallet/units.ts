/** An on-chain amount: whole base units (lamports, wei, the token's smallest unit) and its decimals. */
export interface RawAmount {
  /** A non-negative integer, as a decimal string (it can exceed Number's safe range). */
  raw: string;
  decimals: number;
}

const INTEGER = /^\d+$/;
const TEN = BigInt(10);

/** True for a well-formed amount: digits only, and 0–36 decimals. */
export function isRawAmount(value: unknown): value is RawAmount {
  if (typeof value !== "object" || value === null) return false;
  const { raw, decimals } = value as Record<string, unknown>;
  return typeof raw === "string" && INTEGER.test(raw) && typeof decimals === "number" && Number.isInteger(decimals) && decimals >= 0 && decimals <= 36;
}

/** Base units to whole coins or tokens, e.g. ("1500000000", 9) → 1.5, for maths and USD values. */
export function toUnits({ raw, decimals }: RawAmount): number {
  const scale = TEN ** BigInt(decimals);
  const value = BigInt(raw);
  return Number(value / scale) + Number(value % scale) / Number(scale);
}

/**
 * The amount in whole units, cut (never rounded up) to `places` decimals,
 * without trailing zeros: ("1234567890", 9) → "1.2345". `shift` divides by
 * a further power of ten, e.g. 6 for millions of tokens.
 */
export function floorUnits({ raw, decimals }: RawAmount, shift = 0, places = 4): string {
  const scale = TEN ** BigInt(decimals + shift);
  const value = BigInt(raw);
  const whole = value / scale;
  const cut = ((value % scale) * TEN ** BigInt(places)) / scale;
  const fraction = cut.toString().padStart(places, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * A coin balance for display: up to four decimals ("1.2345", "0.25", "0"),
 * "<0.0001" for dust and en-US grouping from 10,000 up ("12,480.5").
 */
export function formatBalance(amount: RawAmount): string {
  const text = floorUnits(amount);
  if (text === "0") return BigInt(amount.raw) > BigInt(0) ? "<0.0001" : "0";
  const [whole, fraction] = text.split(".");
  if (whole.length < 5) return text;
  const grouped = BigInt(whole).toLocaleString("en-US");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
