import { describe, expect, it } from "vitest";
import { docsFigures, figureStrings, usdValue } from "@/shared/tonk/figures";
import type { TonkSettingsJson } from "@/shared/tonk/types";

/** What the deployed launchpad answers on /api/tonk/settings: 0.005 ETH to launch, 1 ETH and 1.073B tokens of virtual reserves. */
const SETTINGS: TonkSettingsJson = {
  chainId: 4663,
  launchFee: "5000000000000000",
  virtualEth: "1000000000000000000",
  virtualTokens: "1073000000000000000000000000",
  paused: false,
  gasPrice: "10000000",
  readAt: 1,
};

function figures(overrides: Partial<TonkSettingsJson> = {}) {
  const read = docsFigures({ ...SETTINGS, ...overrides });
  if (!read) throw new Error("no figures");
  return read;
}

// The strings the Docs page renders for these settings (modules/docs/tests: DocsView, lib and live).
describe("figureStrings", () => {
  it("writes the figures as the Docs page shows them", () => {
    expect(figureStrings(figures(), null, "ETH")).toEqual({
      launchFee: "0.005 ETH",
      startReserves: "1 ETH and 1,073,000,000 tokens, virtual",
      startCap: "0.93 ETH",
      graduation: "After about 2.93 ETH net into the curve",
      graduationCap: "At a market cap of about 14.4 ETH",
      paused: false,
      usd: null,
    });
  });

  it("adds dollars at a real ETH price, as the page does on mainnet", () => {
    expect(figureStrings(figures(), 3000, "ETH").usd).toEqual({ launchFee: "≈ $15.00", startCap: "≈ $2.8K", graduationCap: "≈ $43.2K" });
    expect(figureStrings(figures({ launchFee: "7000000000000000" }), 3000, "ETH")).toMatchObject({ launchFee: "0.007 ETH", usd: { launchFee: "≈ $21.00" } });
  });

  it("has no dollars without a usable price, and never makes one up", () => {
    for (const price of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(figureStrings(figures(), price, "ETH").usd).toBeNull();
    expect(usdValue(BigInt(10) ** BigInt(18), null)).toBeNull();
  });

  it("counts in the unit it is given, and reads the pause", () => {
    expect(figureStrings(figures({ launchFee: "100000000000000", paused: true }), null, "test ETH")).toMatchObject({
      launchFee: "0.0001 test ETH",
      startReserves: "1 test ETH and 1,073,000,000 tokens, virtual",
      paused: true,
    });
  });
});

describe("docsFigures, shared with the bot", () => {
  it("works out the graduation point from the settings, and refuses settings no curve could run on", () => {
    expect(Number(figures().target) / 1e18).toBeCloseTo(2.9304, 4);
    expect(docsFigures({ ...SETTINGS, virtualEth: "0" })).toBeNull();
    expect(docsFigures({ ...SETTINGS, launchFee: "0.005" })).toBeNull();
  });
});
