import { describe, expect, it } from "vitest";
import { createSeededRandom } from "@/shared/lib/seeded-random";
import { spark, sparklineFor } from "@/shared/lib/sparkline";
import reference from "./fixtures/spark-reference.json";

type SeriesKey = keyof typeof reference.series;
const keys = Object.keys(reference.series) as SeriesKey[];

describe("createSeededRandom", () => {
  it("returns the same sequence for the same seed", () => {
    const a = createSeededRandom(11);
    const b = createSeededRandom(11);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
  });

  it("matches the Park–Miller step used by the reference", () => {
    const next = createSeededRandom(1);
    expect(next()).toBeCloseTo(16807 / 2147483647, 15);
  });
});

describe("spark", () => {
  it.each(keys)("draws the reference path for %s", (key) => {
    const [seed, drift, vol] = reference.series[key];
    expect(spark(seed, drift, vol).line).toBe(reference.lines[key]);
  });

  it("gives the same path string for the same seed", () => {
    expect(spark(29, 0.5, 0.34)).toEqual(spark(29, 0.5, 0.34));
  });

  it("gives different paths for different seeds", () => {
    expect(spark(11, 0.65, 0.22).line).not.toBe(spark(12, 0.65, 0.22).line);
  });

  it("closes the area along the bottom of the 96×32 box", () => {
    const { line, area } = spark(7, -0.6, 0.24);
    expect(area).toBe(`${line} L96 32 L0 32 Z`);
    expect(line.startsWith("M0.0 ")).toBe(true);
  });

  it("memoises by seed", () => {
    const seed = { seed: 53, drift: -0.45, vol: 0.36 };
    expect(sparklineFor(seed)).toBe(sparklineFor({ ...seed }));
    expect(sparklineFor(seed).line).toBe(reference.lines.downB);
  });
});
