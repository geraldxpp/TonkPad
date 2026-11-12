/** Display formatters. Each one reproduces the strings in the approved design. */

const MINUS = "−"; // true minus sign, as in the design ("−12.4%")

function fixed(value: number, decimals: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** 8412 → "8,412" */
export function formatInteger(value: number): string {
  return fixed(Math.round(value), 0);
}

/** 182.4 → "$182.40" (2 decimals), 3412 → "$3,412" (0 decimals) */
export function formatUsd(value: number, decimals = 2): string {
  return `$${fixed(value, decimals)}`;
}

const UNITS = [
  { size: 1e9, suffix: "B" },
  { size: 1e6, suffix: "M" },
  { size: 1e3, suffix: "K" },
] as const;

function decimalsFor(suffix: string, scaled: number): number {
  if (scaled >= 100) return 0;
  if (suffix === "K") return 1;
  return scaled >= 10 ? 1 : 2;
}

/** Rounds, then re-checks the decimals in case rounding crossed 10 or 100. */
function scaledText(scaled: number, suffix: string): string {
  const decimals = decimalsFor(suffix, scaled);
  const text = scaled.toFixed(decimals);
  const settled = decimalsFor(suffix, Number(text));
  return settled < decimals ? scaled.toFixed(settled) : text;
}

/**
 * Compact USD. K values keep one decimal below 100 ("$58.2K", "$19.0K"),
 * M and B values keep two below 10 ("$1.18M") and one below 100 ("$41.8M").
 * `trimZeros` drops a trailing ".0" ("$61K"), as the Volume column does.
 */
export function formatUsdCompact(value: number, options: { trimZeros?: boolean } = {}): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : "";
  for (let i = 0; i < UNITS.length; i++) {
    const unit = UNITS[i];
    if (abs < unit.size) continue;
    const text = scaledText(abs / unit.size, unit.suffix);
    // Rounding can carry into the next unit (999.96K → $1.00M).
    if (Number(text) >= 1000 && i > 0) {
      const next = UNITS[i - 1];
      const carried = scaledText(abs / next.size, next.suffix);
      return `${sign}$${trim(carried, options.trimZeros)}${next.suffix}`;
    }
    return `${sign}$${trim(text, options.trimZeros)}${unit.suffix}`;
  }
  return `${sign}$${trim(abs.toFixed(abs >= 100 ? 0 : 2), options.trimZeros)}`;
}

function trim(text: string, enabled = false): string {
  return enabled ? text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1") : text;
}

/** Small token prices keep three significant digits: 0.0000582 → "$0.0000582". */
export function formatPrice(value: number): string {
  if (value >= 1) return formatUsd(value, 2);
  if (value <= 0) return "$0";
  const decimals = Math.min(12, -Math.floor(Math.log10(value)) + 2);
  return `$${value.toFixed(decimals)}`;
}

/** 412.6 → "+412.6%", -12.4 → "−12.4%" */
export function formatChange(value: number, decimals = 1): string {
  const sign = value < 0 ? MINUS : "+";
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
}

/** How a language writes a short age, {n} being the number: "{n}m" here, "{n} мин" in Russian. */
export interface AgeUnits {
  s: string;
  m: string;
  h: string;
  d: string;
}

/** The compact ages of tables and rows: "45s", "26m", "6h", "18d". */
export const COMPACT_AGE: AgeUnits = { s: "{n}s", m: "{n}m", h: "{n}h", d: "{n}d" };

export const ageIn = (template: string, n: number) => template.replace("{n}", String(n));

/** Minutes since launch → "26m", "6h", "18d", or in a language's own units. */
export function formatAge(minutes: number, units: AgeUnits = COMPACT_AGE): string {
  if (minutes < 60) return ageIn(units.m, Math.max(0, Math.floor(minutes)));
  if (minutes < 60 * 24) return ageIn(units.h, Math.floor(minutes / 60));
  return ageIn(units.d, Math.floor(minutes / (60 * 24)));
}
