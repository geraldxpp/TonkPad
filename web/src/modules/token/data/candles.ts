import type { Candle, ChartMark, ChartTimeframe } from "@/shared/types/token-detail";

/** Seconds per candle for each timeframe. */
export const TF_SECONDS: Record<ChartTimeframe, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3_600, "4h": 14_400, "1D": 86_400 };

/** How the export shapes one timeframe's candles: [position 0–1, market cap in $K] anchors, dip candles, noise and dip depth. */
export interface CandleRecipe {
  seed: number;
  count: number;
  anchors: ReadonlyArray<readonly [number, number]>;
  dips: readonly number[];
  noise: number;
  dip: number;
}

interface RawCandle {
  o: number;
  h: number;
  l: number;
  c: number;
  /** The export's extra random draw, which sizes the volume bar. */
  r: number;
}

/**
 * The export's `gen`, call for call: a Park–Miller generator walks the
 * anchors with noise and dips, and the last candle closes at `lastClose` ($K).
 */
export function generateCandles(recipe: CandleRecipe, lastClose: number): RawCandle[] {
  const { seed, count, anchors, dips, noise, dip } = recipe;
  let s = seed;
  const rnd = () => (s = (s * 16_807) % 2_147_483_647) / 2_147_483_647;
  const at = (t: number) => {
    for (let j = 1; j < anchors.length; j++) {
      const [ta, va] = anchors[j - 1];
      const [tb, vb] = anchors[j];
      if (t <= tb) return va + ((vb - va) * (t - ta)) / (tb - ta);
    }
    return anchors[anchors.length - 1][1];
  };
  const out: RawCandle[] = [];
  let v = anchors[0][1] * (1 - noise / 2);
  for (let i = 0; i < count; i++) {
    const o = v;
    let c = i === count - 1 ? lastClose : at(i / (count - 1)) * (1 + (rnd() - 0.5) * noise);
    if (dips.includes(i)) c = o * (1 - dip * (0.6 + rnd() * 0.4));
    const h = Math.max(o, c) * (1.003 + rnd() * noise * 0.35);
    const l = Math.min(o, c) * (0.997 - rnd() * noise * 0.35);
    out.push({ o, h, l, c, r: rnd() });
    v = c;
  }
  return out;
}

/** The export's volume bar height (px), which sets each candle's share of the last candle's volume. */
const barHeight = (k: RawCandle) => Math.min(44, 5 + k.r * 20 + (Math.abs(k.c - k.o) / k.o) * 140);

/**
 * Candles in USD ending at `now`, one per timeframe step. The last candle's
 * volume is `lastVolume` (the readout's figure); the others scale with the
 * export's bar heights.
 */
export function toCandles(raw: readonly RawCandle[], tf: ChartTimeframe, now: number, lastVolume: number): Candle[] {
  const step = TF_SECONDS[tf];
  const lastOpen = Math.floor(now / 1000 / step) * step;
  const unit = lastVolume / barHeight(raw[raw.length - 1]);
  return raw.map((k, i) => ({
    time: lastOpen - (raw.length - 1 - i) * step,
    open: k.o * 1000,
    high: k.h * 1000,
    low: k.l * 1000,
    close: k.c * 1000,
    volume: barHeight(k) * unit,
  }));
}

/** Marks at the export's positions along the chart (0–1), on the candle nearest each. */
export function marksAt(candles: readonly Candle[], spots: ReadonlyArray<readonly [number, ChartMark["kind"]]>): ChartMark[] {
  return spots.map(([f, kind]) => ({ time: candles[Math.round(f * (candles.length - 1))].time, kind }));
}
