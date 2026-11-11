import { describe, expect, it } from "vitest";
import { GHOSTY } from "../data/ghosty.mock";
import { formatAxisTicks, formatAxisValue, formatChartValue, formatVolume, graduationInView, parseChartValue, parseTimeframe, readoutOf, scaleCandle } from "../lib/chart-data";

const LAST_15M = GHOSTY.chart.candles["15m"].at(-1)!;

describe("price axis zero", () => {
  it("labels a zero line that arrives as a float crumb as $0", () => {
    expect(formatAxisTicks([0.00007, 0.000035, 1.2e-13], "price")).toEqual(["$0.00007", "$0.000035", "$0"]);
  });

  it("leaves ticks under zero blank: the volume bars' room below the candles isn't a price", () => {
    // Live, a chart running from a token's launch near $0 labelled that room "-$0.0005".
    expect(formatAxisTicks([-0.0005, 0, 0.0005, 0.001], "price")).toEqual(["", "$0", "$0.0005", "$0.001"]);
    expect(formatAxisTicks([-0.001, -0.0005, 0, 0.0005, 0.001], "price")).toEqual(["", "", "$0", "$0.0005", "$0.001"]);
    expect(formatAxisTicks([-200_000, 200_000, 400_000], "mcap")).toEqual(["", "$200K", "$400K"]);
  });

  it("still adds decimals to repeated labels when blank ticks sit below them", () => {
    expect(formatAxisTicks([-2e-8, -1e-8, 0.0000334, 0.00003342, 0.00003344], "price")).toEqual([
      "", "", "$0.00003340", "$0.00003342", "$0.00003344",
    ]);
  });

  it("reads $0 for a crosshair under the zero line", () => {
    expect(formatChartValue(-0.0002, "price")).toBe(formatChartValue(0, "price"));
    expect(formatChartValue(-50_000, "mcap")).toBe(formatChartValue(0, "mcap"));
  });
});

describe("chart view state", () => {
  it("reads the timeframe and value from the URL, falling back to 15m and market cap", () => {
    expect(parseTimeframe("1h")).toBe("1h");
    expect(parseTimeframe("1D")).toBe("1D");
    expect(parseTimeframe("2h")).toBe("15m");
    expect(parseTimeframe(null)).toBe("15m");
    expect(parseChartValue("price")).toBe("price");
    expect(parseChartValue("mcap")).toBe("mcap");
    expect(parseChartValue("x")).toBe("price");
    expect(parseChartValue(null)).toBe("price");
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

describe("price-axis labels", () => {
  it("keep the short labels while they differ", () => {
    expect(formatAxisTicks([20_000, 40_000, 60_000], "mcap")).toEqual(["$20K", "$40K", "$60K"]);
    expect(formatAxisTicks([0.00002, 0.00004], "price")).toEqual(["$0.00002", "$0.00004"]);
  });

  it("add decimals when a token barely moves, so no two labels repeat", () => {
    // The live screen showed "$33.4K" three times for a token moving between $33.4K and $33.44K.
    expect(formatAxisTicks([33_400, 33_420, 33_440], "mcap")).toEqual(["$33.40K", "$33.42K", "$33.44K"]);
    expect(formatAxisTicks([1_180_000, 1_181_000, 1_182_000], "mcap")).toEqual(["$1.180M", "$1.181M", "$1.182M"]);
    expect(formatAxisTicks([0.0000334, 0.00003342, 0.00003344], "price")).toEqual(["$0.00003340", "$0.00003342", "$0.00003344"]);
    expect(formatAxisTicks([2.001, 2.002, 2.003], "price")).toEqual(["$2.001", "$2.002", "$2.003"]);
  });

  it("never returns fewer labels than ticks", () => {
    const ticks = [33_400, 33_400.5, 33_401];
    expect(formatAxisTicks(ticks, "mcap")).toHaveLength(3);
    expect(new Set(formatAxisTicks(ticks, "mcap")).size).toBe(3);
  });
});
