import { formatPrice, formatUsd, formatUsdCompact } from "@/shared/lib/format";
import { isTestnetSite, TONK_TESTNET } from "@/shared/tonk/networks";

/**
 * The testnet site counts in test ETH: faucet ETH has no dollar price, so no
 * figure there wears a dollar sign. Everywhere else the page counts in
 * dollars, exactly as before; on mainnet a mission's ETH figures are turned
 * into dollars before they get here (`missionDetail`). The site's mode is
 * fixed when it is built.
 */
export const MONEY_UNIT: string | null = isTestnetSite() ? TONK_TESTNET.unit : null;

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/**
 * A coin amount at four significant digits (or `digits`): "12.5", "0.001787",
 * and for the very small the zeros after the point as a count, "0.0₁₁1787"
 * (a curve token's price in ETH runs to a dozen zeros).
 */
export function coinAmount(value: number, digits = 4): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  const sign = value < 0 ? "−" : "";
  const rounded = Number(Math.abs(value).toPrecision(digits));
  if (rounded >= 1) return sign + rounded.toLocaleString("en-US", { maximumFractionDigits: digits });
  const exponent = Math.floor(Math.log10(rounded));
  const zeros = -exponent - 1;
  const figures = (rounded / 10 ** exponent).toPrecision(digits).replace(".", "").replace(/0+$/, "") || "0";
  const count = [...String(zeros)].map((digit) => SUBSCRIPT[Number(digit)]).join("");
  return `${sign}${zeros >= 5 ? `0.0${count}` : `0.${"0".repeat(zeros)}`}${figures}`;
}

const inUnit = (value: number) => `${coinAmount(value)} ${MONEY_UNIT}`;

/** A market cap or volume: "$1.18M", or "0.001787 test ETH". */
export function moneyCompact(value: number, options?: { trimZeros?: boolean }): string {
  return MONEY_UNIT ? inUnit(value) : formatUsdCompact(value, options);
}

/** One token's price: "$0.0000582", or "0.0₁₁1787 test ETH". */
export function moneyPrice(value: number): string {
  return MONEY_UNIT ? inUnit(value) : formatPrice(value);
}

/** A plain amount: "$412.60", or "0.0002 test ETH". */
export function money(value: number, decimals?: number): string {
  return MONEY_UNIT ? inUnit(value) : formatUsd(value, decimals);
}
