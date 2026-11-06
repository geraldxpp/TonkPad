import type { SparkSeed } from "@/shared/types/token";
import { createSeededRandom } from "./seeded-random";

export interface SparklinePath {
  /** Smooth Catmull-Rom style curve through 26 points in a 96×32 box. */
  line: string;
  /** The same curve closed along the bottom edge, for the soft fill. */
  area: string;
}

const POINTS = 26;
const WIDTH = 96;
const HEIGHT = 32;

/**
 * Port of `spark(seed, drift, vol)` from design-reference/explore.dc.html.
 * Same maths and rounding, so the same seed draws the same path string.
 */
export function spark(seed: number, drift: number, vol: number): SparklinePath {
  const random = createSeededRandom(seed);
  let y = drift > 0 ? 0.28 : 0.72;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < POINTS; i++) {
    y += (random() - 0.5) * vol + drift / POINTS;
    y = Math.min(0.92, Math.max(0.08, y));
    pts.push([(i * WIDTH) / (POINTS - 1), (1 - y) * HEIGHT]);
  }
  return pathThrough(pts);
}

/**
 * The same curve through real values (a live token's market caps, oldest
 * first), scaled into the 0.08–0.92 band the seeded lines use. Fewer than two
 * points, or no movement, draws a flat line through the middle.
 */
export function sparklineFromPoints(values: readonly number[]): SparklinePath {
  const usable = values.filter((v) => Number.isFinite(v));
  const series = usable.length >= 2 ? usable : [0, 0];
  const min = Math.min(...series);
  const max = Math.max(...series);
  const pts = series.map((v, i): [number, number] => {
    const y = max > min ? 0.08 + ((v - min) / (max - min)) * 0.84 : 0.5;
    return [(i * WIDTH) / (series.length - 1), (1 - y) * HEIGHT];
  });
  return pathThrough(pts);
}

function pathThrough(pts: ReadonlyArray<[number, number]>): SparklinePath {
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i - 1] ?? pts[i];
    const b = pts[i];
    const c = pts[i + 1];
    const e = pts[i + 2] ?? c;
    d +=
      ` C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)}` +
      ` ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)}` +
      ` ${f(c[0])} ${f(c[1])}`;
  }
  return { line: d, area: `${d} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z` };
}

const cache = new Map<string, SparklinePath>();

/** Memoised `spark` for a token's seed. */
export function sparklineFor({ seed, drift, vol }: SparkSeed): SparklinePath {
  const key = `${seed}|${drift}|${vol}`;
  let path = cache.get(key);
  if (!path) {
    path = spark(seed, drift, vol);
    cache.set(key, path);
  }
  return path;
}
