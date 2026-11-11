import { describe, expect, it } from "vitest";
import {
  formatAge,
  formatChange,
  formatInteger,
  formatPrice,
  formatUsd,
  formatUsdCompact,
} from "@/shared/lib/format";

describe("formatInteger", () => {
  it.each([
    [8412, "8,412"],
    [1204, "1,204"],
    [988, "988"],
    [41, "41"],
    [0, "0"],
  ])("%d → %s", (value, expected) => {
    expect(formatInteger(value)).toBe(expected);
  });
});

describe("formatUsdCompact (market cap)", () => {
  it.each([
    [58_200, "$58.2K"],
    [1_180_000, "$1.18M"],
    [64_100, "$64.1K"],
    [864_000, "$864K"],
    [37_400, "$37.4K"],
    [276_000, "$276K"],
    [21_300, "$21.3K"],
    [19_000, "$19.0K"],
    [11_600, "$11.6K"],
    [7_300, "$7.3K"],
    [41_800_000, "$41.8M"],
  ])("%d → %s", (value, expected) => {
    expect(formatUsdCompact(value)).toBe(expected);
  });

  it("carries across unit and decimal boundaries", () => {
    expect(formatUsdCompact(99_960)).toBe("$100K");
    expect(formatUsdCompact(999_960)).toBe("$1.00M");
    expect(formatUsdCompact(9_996_000)).toBe("$10.0M");
    expect(formatUsdCompact(2_500_000_000)).toBe("$2.50B");
  });

  it("uses a true minus sign for negatives", () => {
    expect(formatUsdCompact(-58_200)).toBe("−$58.2K");
  });
});

describe("formatUsdCompact (volume, trimmed)", () => {
  it.each([
    [186_000, "$186K"],
    [842_000, "$842K"],
    [61_000, "$61K"],
    [18_000, "$18K"],
    [12_000, "$12K"],
    [9_400, "$9.4K"],
    [2_100, "$2.1K"],
  ])("%d → %s", (value, expected) => {
    expect(formatUsdCompact(value, { trimZeros: true })).toBe(expected);
  });
});

describe("formatUsd", () => {
  it("formats status-bar prices", () => {
    expect(formatUsd(182.4)).toBe("$182.40");
    expect(formatUsd(3412, 0)).toBe("$3,412");
  });
});

describe("formatPrice", () => {
  it("keeps three significant digits for tiny prices", () => {
    expect(formatPrice(0.0000582)).toBe("$0.0000582");
    expect(formatPrice(0.0123)).toBe("$0.0123");
    expect(formatPrice(1.5)).toBe("$1.50");
  });
});

describe("formatChange", () => {
  it.each([
    [412.6, "+412.6%"],
    [221, "+221.0%"],
    [-12.4, "−12.4%"],
    [-8.1, "−8.1%"],
    [0, "+0.0%"],
  ])("%d → %s", (value, expected) => {
    expect(formatChange(value)).toBe(expected);
  });
});

describe("formatAge", () => {
  it.each([
    [4, "4m"],
    [52, "52m"],
    [60, "1h"],
    [360, "6h"],
    [2_880, "2d"],
    [25_920, "18d"],
  ])("%d minutes → %s", (minutes, expected) => {
    expect(formatAge(minutes)).toBe(expected);
  });
});

describe("formatAge in a language's own units", () => {
  it("writes Russian ages in Cyrillic, never a Latin m beside назад (campaign round 1)", () => {
    const ru = { s: "{n} с", m: "{n} мин", h: "{n} ч", d: "{n} дн." };
    expect([2, 180, 4_320].map((minutes) => formatAge(minutes, ru))).toEqual(["2 мин", "3 ч", "3 дн."]);
    expect(formatAge(2)).toBe("2m");
  });
});
