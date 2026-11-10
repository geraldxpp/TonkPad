import { describe, expect, it } from "vitest";
import { buyQuote, CURVE_SUPPLY, type CurveSettings, devBuyPresets, devBuyQuote, freshCurve, graduationTarget, marketCap, maxDevBuy, percentOf, TOTAL_SUPPLY, WEI } from "@/shared/tonk/curve";
import { CREATOR_OPTIONS, CREW_OPTIONS, lockedAmount, type LockSettings, lockTier, optionAtMost, stillLocked } from "@/shared/tonk/rules";

const eth = (text: string) => {
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * WEI + BigInt(fraction.padEnd(18, "0"));
};
const tokens = (wei: bigint) => wei / WEI;
/** Wei as a plain number of ETH, for comparing with the prompt's rounded figures. */
const asEth = (wei: bigint) => Number(wei) / 1e18;
const V_TOKENS = BigInt(1_073_000_000) * WEI;

/** The contract's defaults, and what the testnet launchpad was set to (read from it on 10 Nov 2026). */
const MAINNET: CurveSettings = { launchFee: eth("0.005"), virtualEth: eth("6"), virtualTokens: V_TOKENS };
const TESTNET: CurveSettings = { launchFee: eth("0.0001"), virtualEth: eth("0.0015"), virtualTokens: V_TOKENS };
const VEST: LockSettings = { type: "linear", sharePct: 80, days: 180 };

describe("the creator's buy inside the launch", () => {
  it("matches the prompt's mainnet check values to the wei", () => {
    const quote = devBuyQuote(MAINNET, eth("0.25"), 100);
    expect(quote.protocolFee).toBe(eth("0.0025"));
    expect(quote.creatorFee).toBe(eth("0.0025"));
    // No Crew fee: nobody holds the token while it is being launched.
    expect(quote.crewFee).toBe(BigInt(0));
    expect(quote.netEthIn).toBe(eth("0.245"));
    expect(quote.tokensOut).toBe(V_TOKENS - (eth("6") * V_TOKENS) / eth("6.245"));
    expect(tokens(quote.tokensOut)).toBe(BigInt(42_095_276));
    expect(percentOf(quote.tokensOut, TOTAL_SUPPLY).toFixed(2)).toBe("4.21");
    expect(percentOf(quote.tokensOut, CURVE_SUPPLY).toFixed(2)).toBe("5.26");
    const locked = lockedAmount(quote.tokensOut, VEST);
    expect(tokens(locked)).toBe(BigInt(33_676_220));
    expect(tokens(quote.tokensOut - locked)).toBe(BigInt(8_419_055));
    expect(marketCap(MAINNET.virtualEth, MAINNET.virtualTokens)).toBe((eth("6") * TOTAL_SUPPLY) / V_TOKENS);
    expect(asEth(marketCap(MAINNET.virtualEth, MAINNET.virtualTokens))).toBeCloseTo(5.5918, 4);
    expect(asEth(marketCap(quote.newVirtualEth, quote.newVirtualTokens))).toBeCloseTo(6.0578, 4);
  });

  it("matches the live testnet check values: the owner's first test launch", () => {
    const quote = devBuyQuote(TESTNET, eth("0.0002"), 100);
    expect(TESTNET.launchFee + eth("0.0002")).toBe(eth("0.0003"));
    expect(quote.protocolFee).toBe(eth("0.000002"));
    expect(quote.creatorFee).toBe(eth("0.000002"));
    expect(quote.netEthIn).toBe(eth("0.000196"));
    expect(tokens(quote.tokensOut)).toBe(BigInt(124_002_358));
    expect(percentOf(quote.tokensOut, TOTAL_SUPPLY).toFixed(2)).toBe("12.40");
    expect(percentOf(quote.tokensOut, CURVE_SUPPLY).toFixed(2)).toBe("15.50");
    expect(tokens(lockedAmount(quote.tokensOut, VEST))).toBe(BigInt(99_201_886));
    expect(asEth(marketCap(TESTNET.virtualEth, TESTNET.virtualTokens))).toBeCloseTo(0.001398, 6);
    expect(asEth(marketCap(quote.newVirtualEth, quote.newVirtualTokens))).toBeCloseTo(0.001787, 6);
  });

  it("buys nothing and moves nothing without a dev buy", () => {
    const quote = devBuyQuote(MAINNET, BigInt(0), 50);
    expect(quote.tokensOut).toBe(BigInt(0));
    expect(quote.newVirtualEth).toBe(MAINNET.virtualEth);
  });
});

describe("the curve", () => {
  it("fills at the graduation target, and refunds what a last buy sends beyond it", () => {
    expect(asEth(graduationTarget(MAINNET))).toBeCloseTo(17.5824, 4);
    expect(asEth(graduationTarget(TESTNET))).toBeCloseTo(0.004396, 6);
    // A buy far past the target takes the whole curve: the target grossed up for its 4% of fees, the rest refunded.
    const all = buyQuote(freshCurve(TESTNET), eth("1"), 200, 100);
    const gross = (graduationTarget(TESTNET) * BigInt(10_000) + BigInt(9_599)) / BigInt(9_600);
    expect(all.tokensOut).toBe(CURVE_SUPPLY);
    expect(all.effectiveEthIn).toBe(gross);
    expect(all.refundEth).toBe(eth("1") - gross);
    expect(all.netEthIn).toBeGreaterThanOrEqual(graduationTarget(TESTNET));
    expect(all.netEthIn - graduationTarget(TESTNET)).toBeLessThan(BigInt(10));
  });

  it("charges every fee on an ordinary buy, and never sells more than the curve has left", () => {
    const quote = buyQuote({ virtualEth: eth("6"), virtualTokens: V_TOKENS, tokensLeft: CURVE_SUPPLY }, eth("1"), 200, 100);
    expect(quote.protocolFee).toBe(eth("0.01"));
    expect(quote.crewFee).toBe(eth("0.02"));
    expect(quote.creatorFee).toBe(eth("0.01"));
    expect(quote.netEthIn).toBe(eth("0.96"));
    expect(quote.tokensOut).toBe(V_TOKENS - (eth("6") * V_TOKENS) / eth("6.96"));
    const scarce = buyQuote({ virtualEth: eth("6"), virtualTokens: V_TOKENS, tokensLeft: BigInt(5) * WEI }, eth("1"), 0, 0);
    expect(scarce.tokensOut).toBe(BigInt(5) * WEI);
    expect(scarce.refundEth).toBeGreaterThan(BigInt(0));
  });

  it("scales the dev-buy presets and cap with the reserve", () => {
    expect(devBuyPresets(MAINNET)).toEqual([eth("0.1"), eth("0.25"), eth("0.5")]);
    expect(devBuyPresets(TESTNET)).toEqual([eth("0.000025"), eth("0.0000625"), eth("0.000125")]);
    expect(maxDevBuy(MAINNET)).toBe(eth("10"));
    expect(maxDevBuy(TESTNET)).toBe(eth("0.0025"));
    // Each preset buys the same share of supply on either network.
    for (const [index, preset] of devBuyPresets(MAINNET).entries()) {
      const main = percentOf(devBuyQuote(MAINNET, preset, 100).tokensOut, TOTAL_SUPPLY);
      const test = percentOf(devBuyQuote(TESTNET, devBuyPresets(TESTNET)[index], 100).tokensOut, TOTAL_SUPPLY);
      expect(test).toBeCloseTo(main, 4);
    }
    // The largest dev buy stays well inside the curve: about two thirds of supply.
    expect(percentOf(devBuyQuote(MAINNET, maxDevBuy(MAINNET), 0).tokensOut, TOTAL_SUPPLY)).toBeCloseTo(66.81, 1);
  });
});

describe("locks and Creator Rewards tiers", () => {
  it.each([
    [{ type: "linear", sharePct: 80, days: 180 }, "ironclad"],
    [{ type: "time", sharePct: 80, days: 90 }, "ironclad"],
    [{ type: "time", sharePct: 75, days: 365 }, "standard"],
    [{ type: "linear", sharePct: 80, days: 60 }, "standard"],
    [{ type: "time", sharePct: 50, days: 30 }, "standard"],
    [{ type: "time", sharePct: 100, days: 29 }, "none"],
    [{ type: "time", sharePct: 100, days: 7 }, "none"],
    [{ type: "none", sharePct: 100, days: 365 }, "none"],
  ] as [LockSettings, string][])("%o is the %s tier", (lock, tier) => {
    expect(lockTier(true, lock)).toBe(tier);
    expect(lockTier(false, lock)).toBe("none");
  });

  it("holds a time-lock whole until its end, and releases a vest every day", () => {
    const locked = BigInt(180_000) * WEI;
    const time: LockSettings = { type: "time", sharePct: 100, days: 180 };
    expect(stillLocked(locked, time, 179)).toBe(locked);
    expect(stillLocked(locked, time, 180)).toBe(BigInt(0));
    expect(stillLocked(locked, VEST, 30)).toBe(BigInt(150_000) * WEI);
    expect(stillLocked(locked, VEST, 180)).toBe(BigInt(0));
    expect(stillLocked(locked, { ...VEST, type: "none" }, 0)).toBe(BigInt(0));
  });

  it("picks the highest fee option that fits", () => {
    expect(optionAtMost(CREATOR_OPTIONS, 250)).toBe(200);
    expect(optionAtMost(CREATOR_OPTIONS, 50)).toBe(50);
    expect(optionAtMost(CREW_OPTIONS, 99)).toBe(0);
    expect(optionAtMost(CREW_OPTIONS, 400)).toBe(400);
  });
});
