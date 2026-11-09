import { formatChange, formatInteger, formatPrice, formatUsdCompact } from "@/shared/lib/format";
import { CHART_TIMEFRAMES, type Candle, type ChartTimeframe } from "@/shared/types/token-detail";

/** What the candles plot: market cap in USD (the export's default) or the price of one token. */
export type ChartValue = "mcap" | "price";

export const DEFAULT_TIMEFRAME: ChartTimeframe = "15m";

/** The URL's ?tf=, or the default when it is missing or unknown. */
export function parseTimeframe(raw: string | null): ChartTimeframe {
  return CHART_TIMEFRAMES.find((tf) => tf === raw) ?? DEFAULT_TIMEFRAME;
}

/** The URL's ?chart=price, else market cap. */
export const parseChartValue = (raw: string | null): ChartValue => (raw === "price" ? "price" : "mcap");

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
  return formatPrice(value).replace(/(\.\d*?[1-9])0+$/, "$1");
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
