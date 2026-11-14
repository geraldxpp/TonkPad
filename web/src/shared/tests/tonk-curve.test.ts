import { describe, expect, it } from "vitest";
import { buyQuote, CURVE_SUPPLY, type CurveSettings, devBuyPresets, devBuyQuote, freshCurve, graduationTarget, marketCap, maxDevBuy, minDevBuyFor, percentOf, roundAmount, TOTAL_SUPPLY, WEI } from "@/shared/tonk/curve";
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
    // The live mainnet reserve of 1 ETH: 0.0166…, 0.0416… and 0.0833… turned into amounts that read cleanly.
    expect(devBuyPresets({ ...MAINNET, virtualEth: eth("1") })).toEqual([eth("0.02"), eth("0.04"), eth("0.08")]);
    expect(devBuyPresets(TESTNET)).toEqual([eth("0.000025"), eth("0.00006"), eth("0.00015")]);
    expect(maxDevBuy(MAINNET)).toBe(eth("10"));
    expect(maxDevBuy(TESTNET)).toBe(eth("0.0025"));
  });

  it("keeps the presets round, the smallest at or above its share and the default under 5% of supply, on every reserve", () => {
    // The owner can set the reserve anywhere from 1 to 100 ETH; the testnet runs on 0.0015.
    const reserves = [eth("0.0015"), ...Array.from({ length: 991 }, (_, step) => eth("1") + (BigInt(step) * eth("1")) / BigInt(10))];
    for (const virtualEth of reserves) {
      const settings = { ...MAINNET, virtualEth };
      const [small, middle, large] = devBuyPresets(settings);
      for (const preset of [small, middle, large]) expect(roundAmount(preset)).toBe(preset);
      // The smallest never buys less than the exact ÷ 60, so a lock of it reaches the same 10M floors.
      expect(small).toBeGreaterThanOrEqual(virtualEth / BigInt(60));
      // The middle one, the form's default, never buys more than the exact ÷ 24: under 5% of supply even with no fees.
      expect(middle).toBeLessThanOrEqual(virtualEth / BigInt(24));
      expect(percentOf(devBuyQuote(settings, middle, 0).tokensOut, TOTAL_SUPPLY)).toBeLessThan(5);
      expect(small < middle && middle < large).toBe(true);
    }
    // The largest dev buy stays well inside the curve: about two thirds of supply.
    expect(percentOf(devBuyQuote(MAINNET, maxDevBuy(MAINNET), 0).tokensOut, TOTAL_SUPPLY)).toBeCloseTo(66.81, 1);
  });
});

describe("the smallest dev buy for a number of tokens", () => {
  it("is never a wei short, at any Creator Rewards rate, and says when even the largest buy can't", () => {
    const live = { ...MAINNET, virtualEth: eth("1") };
    const target = BigInt(12_500_000) * WEI;
    for (const creator of [0, 50, 200, 400]) {
      const least = minDevBuyFor(live, target, creator);
      expect(least).not.toBeNull();
      expect(devBuyQuote(live, least ?? BigInt(0), creator).tokensOut).toBeGreaterThanOrEqual(target);
      expect(devBuyQuote(live, (least ?? BigInt(1)) - BigInt(1), creator).tokensOut).toBeLessThan(target);
    }
    // 12.5M at 2%: about 0.01215 ETH on the live 1 ETH reserve, so 80% of it locks 10M.
    expect(asEth(minDevBuyFor(live, target, 200) ?? BigInt(0))).toBeCloseTo(0.012151, 5);
    expect(minDevBuyFor(live, BigInt(700_000_000) * WEI, 0)).toBeNull();
  });
});

describe("round amounts", () => {
  it("picks the nearest of 1, 1.5, 2, 2.5, 3, 4, 5, 6 and 8 times a power of ten, by ratio", () => {
    const cases: [string, string][] = [
      ["0.016666666666666666", "0.015"],
      ["0.041666666666666666", "0.04"],
      ["0.083333333333333333", "0.08"],
      ["0.25", "0.25"],
      ["0.0000625", "0.00006"],
      ["0.000125", "0.00015"],
      ["0.09", "0.1"],
      ["7", "8"],
      ["1", "1"],
    ];
    for (const [input, output] of cases) expect(roundAmount(eth(input))).toBe(eth(output));
    // Below 10 wei there is nothing to round.
    expect([roundAmount(BigInt(0)), roundAmount(BigInt(7))]).toEqual([BigInt(0), BigInt(7)]);
  });

  it("can round down or up instead, and leaves round amounts alone in every mode", () => {
    expect(roundAmount(eth("0.016666666666666666"), "up")).toBe(eth("0.02"));
    expect(roundAmount(eth("0.016666666666666666"), "down")).toBe(eth("0.015"));
    expect(roundAmount(eth("0.125"), "down")).toBe(eth("0.1"));
    expect(roundAmount(eth("0.125"), "up")).toBe(eth("0.15"));
    expect(roundAmount(eth("0.79"), "up")).toBe(eth("0.8"));
    expect(roundAmount(eth("0.81"), "up")).toBe(eth("1"));
    for (const mode of ["nearest", "down", "up"] as const) {
      expect([roundAmount(eth("0.25"), mode), roundAmount(eth("0.000025"), mode), roundAmount(eth("8"), mode)]).toEqual([eth("0.25"), eth("0.000025"), eth("8")]);
    }
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
