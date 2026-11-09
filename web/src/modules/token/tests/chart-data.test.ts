import { describe, expect, it } from "vitest";
import { GHOSTY } from "../data/ghosty.mock";
import { formatAxisValue, formatChartValue, formatVolume, graduationInView, parseChartValue, parseTimeframe, readoutOf, scaleCandle } from "../lib/chart-data";

const LAST_15M = GHOSTY.chart.candles["15m"].at(-1)!;

describe("chart view state", () => {
  it("reads the timeframe and value from the URL, falling back to 15m and market cap", () => {
    expect(parseTimeframe("1h")).toBe("1h");
    expect(parseTimeframe("1D")).toBe("1D");
    expect(parseTimeframe("2h")).toBe("15m");
    expect(parseTimeframe(null)).toBe("15m");
    expect(parseChartValue("price")).toBe("price");
    expect(parseChartValue("mcap")).toBe("mcap");
    expect(parseChartValue("x")).toBe("mcap");
  });
});

describe("chart data mapping", () => {
  it("shows the export's 15m readout for Ghosty", () => {
    expect(readoutOf(LAST_15M, "mcap", GHOSTY.supply)).toEqual({
      open: "$58.7K",
      high: "$58.9K",
      low: "$58.0K",
      close: "$58.2K",
      change: "−0.87%",
      up: false,
      volume: "2.14",
    });
  });

  it("divides by supply for the Price view and leaves volume alone", () => {
    const price = scaleCandle(LAST_15M, "price", GHOSTY.supply);
    expect(price.close).toBeCloseTo(0.0000582, 9);
    expect(price.volume).toBe(LAST_15M.volume);
    expect(readoutOf(LAST_15M, "price", GHOSTY.supply).close).toBe("$0.0000582");
  });

  it("formats axis labels without trailing zeros", () => {
    expect(formatAxisValue(40_000, "mcap")).toBe("$40K");
    expect(formatAxisValue(58_200, "mcap")).toBe("$58.2K");
    expect(formatAxisValue(0.00004, "price")).toBe("$0.00004");
    expect(formatChartValue(1_180_000, "mcap")).toBe("$1.18M");
  });

  it("formats volumes like the readout", () => {
    expect(formatVolume(0.18)).toBe("0.18");
    expect(formatVolume(21.6)).toBe("21.6");
    expect(formatVolume(1_240)).toBe("1,240");
  });

  it("draws the graduation line only while it sits within twice the candles' high", () => {
    const candles = GHOSTY.chart.candles["15m"];
    expect(graduationInView(candles, 70_000)).toBe(true);
    expect(graduationInView(candles, 500_000)).toBe(false);
    expect(graduationInView(candles, null)).toBe(false);
  });
});
