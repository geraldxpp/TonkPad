import { formatChange, formatInteger, formatPrice, formatUsdCompact } from "@/shared/lib/format";
import { CHART_TIMEFRAMES, type Candle, type ChartTimeframe } from "@/shared/types/token-detail";

/** What the candles plot: the price of one token or the market cap in USD. */
export type ChartValue = "mcap" | "price";

export const DEFAULT_TIMEFRAME: ChartTimeframe = "15m";

/** The URL's ?tf=, or the default when it is missing or unknown. */
export function parseTimeframe(raw: string | null): ChartTimeframe {
  return CHART_TIMEFRAMES.find((tf) => tf === raw) ?? DEFAULT_TIMEFRAME;
}

/** The URL's ?chart=price, else market cap. */
/** Price is the default (the card's heading leads with it); MCap is kept in the URL. */
export const DEFAULT_CHART_VALUE: ChartValue = "price";
export const parseChartValue = (raw: string | null): ChartValue => (raw === "mcap" ? "mcap" : DEFAULT_CHART_VALUE);

/** A candle in the chart's units. Volume stays in the chain's coin. */
export function scaleCandle(candle: Candle, value: ChartValue, supply: number | null): Candle {
  if (value === "mcap" || supply === null || supply <= 0) return candle;
  const { open, high, low, close } = candle;
  return { ...candle, open: open / supply, high: high / supply, low: low / supply, close: close / supply };
}

/** Readout and crosshair text: "$58.7K", or "$0.0000587" per token. */
export function formatChartValue(value: number, kind: ChartValue): string {
  return kind === "mcap" ? formatUsdCompact(value) : formatPrice(value);
}

/** Price-axis labels drop trailing zeros: "$40K", "$0.00004". */
export function formatAxisValue(value: number, kind: ChartValue): string {
  if (kind === "mcap") return formatUsdCompact(value, { trimZeros: true });
  if (value === 0) return "$0";
  return formatPrice(value).replace(/(\.\d*?[1-9])0+$/, "$1");
}

const UNITS = [
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
] as const;

/** A label with a set number of decimals: "$33.45K" (market cap) or "$0.00003342" (price). */
function preciseLabel(value: number, kind: ChartValue, extra: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (kind === "mcap") {
    const [size, suffix] = UNITS.find(([unit]) => abs >= unit) ?? [1, ""];
    return `${sign}$${(abs / size).toFixed(extra)}${suffix}`;
  }
  if (abs === 0) return "$0";
  const decimals = abs >= 1 ? 2 + extra : Math.min(15, -Math.floor(Math.log10(abs)) + 2 + extra);
  return `${sign}$${abs.toFixed(decimals)}`;
}

const distinct = (labels: readonly string[]) => new Set(labels).size === labels.length;

/**
 * The price axis's labels, all at once. When a token barely moves, the usual
 * labels repeat ("$33.4K" three times), so decimals are added until every
 * label differs: "$33.40K", "$33.42K", "$33.44K".
 */
export function formatAxisTicks(ticks: readonly number[], kind: ChartValue): string[] {
  // The axis's zero line can arrive as a float crumb (1e-13): it is zero next to the other ticks.
  const top = Math.max(0, ...ticks.map(Math.abs));
  const prices = ticks.map((tick) => (Math.abs(tick) < top * 1e-6 ? 0 : tick));
  const labels = prices.map((price) => formatAxisValue(price, kind));
  if (distinct(labels)) return labels;
  for (let extra = 1; extra <= 6; extra++) {
    const precise = prices.map((price) => preciseLabel(price, kind, extra));
    if (distinct(precise)) return precise;
  }
  return labels;
}

/** The readout's volume: "0.18", "2.14", "21.6", "1,240". */
export function formatVolume(value: number): string {
  if (value >= 100) return formatInteger(value);
  return value.toFixed(value >= 10 ? 1 : 2);
}

export interface Readout {
  open: string;
  high: string;
  low: string;
  close: string;
  /** The candle's own move, open to close: "−0.87%". */
  change: string;
  up: boolean;
  volume: string;
}

/** The line above the chart for one candle (the hovered one, else the last). */
export function readoutOf(candle: Candle, kind: ChartValue, supply: number | null): Readout {
  const scaled = scaleCandle(candle, kind, supply);
  const move = candle.open > 0 ? ((candle.close - candle.open) / candle.open) * 100 : 0;
  return {
    open: formatChartValue(scaled.open, kind),
    high: formatChartValue(scaled.high, kind),
    low: formatChartValue(scaled.low, kind),
    close: formatChartValue(scaled.close, kind),
    change: formatChange(move, 2),
    up: move >= 0,
    volume: formatVolume(candle.volume),
  };
}

/**
 * The graduation line is drawn while it sits within reach of the candles
 * (up to twice their high); further off it would flatten them.
 */
export function graduationInView(candles: readonly Candle[], cap: number | null): boolean {
  if (cap === null || candles.length === 0) return false;
  const high = Math.max(...candles.map((c) => c.high));
  return cap <= high * 2;
}
