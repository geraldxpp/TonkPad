import { describe, expect, it } from "vitest";
import { generateCandles, marksAt, TF_SECONDS, toCandles } from "../data/candles";
import { GHOSTY, MOCK_NOW } from "../data/ghosty.mock";
import { genericDetail } from "../data/generic.mock";
import { TOKENS } from "@/shared/data/mock-tokens";
import { CHART_TIMEFRAMES } from "@/shared/types/token-detail";

const RECIPE = { seed: 7, count: 62, anchors: [[0, 12.8], [0.3, 19.6], [0.55, 31.5], [0.8, 47.2], [1, 58.2]], dips: [14, 27, 28, 41, 49, 57], noise: 0.05, dip: 0.07 } as const;

describe("generateCandles", () => {
  it("gives the same candles for the same seed", () => {
    expect(generateCandles(RECIPE, 58.2)).toEqual(generateCandles(RECIPE, 58.2));
  });

  it("gives different candles for a different seed", () => {
    expect(generateCandles({ ...RECIPE, seed: 8 }, 58.2)).not.toEqual(generateCandles(RECIPE, 58.2));
  });

  it("chains each open to the last close, keeps highs and lows outside the body, and ends on the given close", () => {
    const raw = generateCandles(RECIPE, 58.2);
    expect(raw).toHaveLength(62);
    expect(raw.at(-1)?.c).toBe(58.2);
    for (let i = 0; i < raw.length; i++) {
      const k = raw[i];
      if (i > 0) expect(k.o).toBe(raw[i - 1].c);
      expect(k.h).toBeGreaterThanOrEqual(Math.max(k.o, k.c));
      expect(k.l).toBeLessThanOrEqual(Math.min(k.o, k.c));
    }
  });
});

describe("toCandles", () => {
  it("steps one timeframe apart up to the candle that holds `now`, in USD, with the last volume as given", () => {
    const candles = toCandles(generateCandles(RECIPE, 58.2), "15m", MOCK_NOW, 2.14);
    const last = candles.at(-1)!;
    expect(last.time).toBe(Math.floor(MOCK_NOW / 1000 / 900) * 900);
    expect(candles[1].time - candles[0].time).toBe(TF_SECONDS["15m"]);
    expect(last.close).toBeCloseTo(58_200);
    expect(last.volume).toBeCloseTo(2.14);
  });

  it("puts marks on the candle nearest each position", () => {
    const candles = toCandles(generateCandles(RECIPE, 58.2), "15m", MOCK_NOW, 2.14);
    expect(marksAt(candles, [[0, "whale"], [1, "smart"]])).toEqual([
      { time: candles[0].time, kind: "whale" },
      { time: candles[61].time, kind: "smart" },
    ]);
  });
});

describe("mock token screens", () => {
  it("give Ghosty the export's figures on every timeframe", () => {
    for (const tf of CHART_TIMEFRAMES) {
      const candles = GHOSTY.chart.candles[tf];
      expect(candles).toHaveLength(tf === "1D" ? 19 : 62);
      expect(candles.at(-1)!.close).toBeCloseTo(58_200);
      expect(GHOSTY.chart.marks[tf]).toHaveLength(4);
    }
  });

  it("build every other mock token the same way each time", () => {
    for (const token of TOKENS) {
      const a = genericDetail(token);
      expect(a).toEqual(genericDetail(token));
      expect(a.chart.candles["1h"].at(-1)!.close).toBeCloseTo(token.marketCap, -1);
      expect(a.trades.length).toBeGreaterThan(8);
    }
  });
});
