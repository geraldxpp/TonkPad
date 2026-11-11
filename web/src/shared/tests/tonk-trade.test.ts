import { describe, expect, it } from "vitest";
import { buyQuote, curveFilled, marketCap, minimumOut, type MissionCurve, sellQuote, tokenPrice, WEI } from "@/shared/tonk/curve";
import { claimableAt, DAY_SECONDS, type DevLockState, extendLock, lockedAt } from "@/shared/tonk/lock";
import type { MissionJson } from "@/shared/tonk/mission";
import { chargedCrewBps, quoteTrade } from "@/shared/tonk/quote";

// The owner's test token (Tonk Test One) on Robinhood Chain Testnet at block 151,327,091, 10 Nov 2026.
// Every figure below was simulated against the deployed contract (prompts/04, section 14.5).
const CURVE: MissionCurve = {
  virtualEth: BigInt("1696000000000000"),
  virtualTokens: BigInt("948997641509433962264150943"),
  tokensLeft: BigInt("675997641509433962264150943"),
  realEth: BigInt("196000000000000"),
};
const CREW = 200;
const CREATOR = 100;
const eth = (text: string) => BigInt(Math.round(Number(text) * 1e9)) * BigInt(1e9);

describe("a buy on a curve mid-life, as the contract quotes it", () => {
  it("takes the three fees off first and matches the contract to the wei", () => {
    const small = buyQuote(CURVE, eth("0.00005"), CREW, CREATOR);
    expect(small.tokensOut).toBe(BigInt("26119201142461485199930760"));
    expect([small.protocolFee, small.crewFee, small.creatorFee]).toEqual([BigInt("500000000000"), BigInt("1000000000000"), BigInt("500000000000")]);
    expect(small.refundEth).toBe(BigInt(0));
    expect(buyQuote(CURVE, eth("0.001"), CREW, CREATOR).tokensOut).toBe(BigInt("343011195726301432143669016"));
  });

  it("is cut to what the curve needs, refunds the rest and buys every token left", () => {
    const last = buyQuote(CURVE, eth("0.009"), CREW, CREATOR);
    expect(last.tokensOut).toBe(CURVE.tokensLeft);
    expect(last.refundEth).toBe(BigInt("4625412087912087"));
    expect(last.effectiveEthIn + last.refundEth).toBe(eth("0.009"));
    expect(last.newVirtualTokens).toBe(CURVE.virtualTokens - CURVE.tokensLeft);
  });

  it("charges no Crew fee while nobody eligible holds the token", () => {
    const withCrew = buyQuote(CURVE, eth("0.00005"), CREW, CREATOR);
    const without = buyQuote(CURVE, eth("0.00005"), 0, CREATOR);
    expect(without.crewFee).toBe(BigInt(0));
    expect(without.tokensOut > withCrew.tokensOut).toBe(true);
  });
});

describe("a sell, as the contract pays it", () => {
  it("matches the contract to the wei", () => {
    const tokens = (count: number) => BigInt(count) * WEI;
    expect(sellQuote(CURVE, tokens(1_000_000), CREW, CREATOR)).toMatchObject({ netEthOut: BigInt("1713856886439"), grossEthOut: BigInt("1785267590039"), capped: false });
    expect(sellQuote(CURVE, tokens(10_000_000), CREW, CREATOR)).toMatchObject({ netEthOut: BigInt("16977726842347"), grossEthOut: BigInt("17685132127443") });
    expect(sellQuote(CURVE, tokens(24_800_471), CREW, CREATOR).netEthOut).toBe(BigInt("41465612168118"));
  });

  it("moves the reserves as the contract does", () => {
    const quote = sellQuote(CURVE, BigInt(10_000_000) * WEI, CREW, CREATOR);
    expect(quote.newVirtualTokens).toBe(CURVE.virtualTokens + BigInt(10_000_000) * WEI);
    expect(quote.newVirtualEth).toBe(CURVE.virtualEth - quote.grossEthOut);
    expect(quote.protocolFee + quote.crewFee + quote.creatorFee + quote.netEthOut).toBe(quote.grossEthOut);
  });

  it("never pays more than the ETH really in the curve", () => {
    const thin = sellQuote({ ...CURVE, realEth: BigInt("10000000000000") }, BigInt(24_800_471) * WEI, CREW, CREATOR);
    expect(thin.capped).toBe(true);
    expect(thin.grossEthOut).toBe(BigInt("10000000000000"));
    expect(thin.newVirtualEth).toBe(CURVE.virtualEth - BigInt("10000000000000"));
  });

  it("waives the Crew fee with no eligible holders", () => {
    const quote = sellQuote(CURVE, BigInt(1_000_000) * WEI, 0, CREATOR);
    expect(quote.crewFee).toBe(BigInt(0));
    expect(quote.netEthOut).toBe(quote.grossEthOut - quote.protocolFee - quote.creatorFee);
  });
});

// APNL1 on Robinhood Chain Testnet at block 151,758,968 (11 Nov 2026): one wallet held every eligible token.
// The launchpad simulated its full sale at 71,591,580,138,635 wei, and the app refused it (Astra's release review).
const mission = (patch: Partial<MissionJson> = {}): MissionJson => ({
  chainId: 46630,
  token: "0x952a8C953F42216e8333435Fd2D8819D6cD9E96a",
  name: "APNL1",
  symbol: "APNL1",
  creator: "0xd0d0620Bcf60F15a0aC75753fCc0EbF2d65b268f",
  launchedAt: 1_794_388_791,
  launchBlock: 151_749_598,
  crewBps: 200,
  creatorBps: 50,
  graduated: false,
  paused: false,
  virtualEth: "1572681807247344",
  virtualTokens: "1023411088360650609946825148",
  realEth: "72681807247344",
  tokensLeft: "750411088360650609946825148",
  eligibleSupply: "49588911639349390053174852",
  crewPaid: "0",
  metadata: "",
  agentPrompt: "",
  lock: { type: "none", lockedBps: 0, start: 0, end: 0, total: "0", claimed: "0", checkpoint: "0" },
  creatorHeld: "0",
  block: 151_758_968,
  buyingOpen: true,
  readAt: 1_794_390_457_000,
  ...patch,
});
const LAST_HOLDER = mission();
const ALL = BigInt(LAST_HOLDER.eligibleSupply);

describe("the Crew fee on a sell, as the contract charges it after the tokens move", () => {
  it("pays the last eligible holder's full exit exactly what the launchpad simulated", () => {
    const quote = quoteTrade(LAST_HOLDER, "sell", ALL, 0);
    expect(quote).toMatchObject({ out: "71591580138635", crewFee: "0", protocolFee: "726818072473", creatorFee: "363409036236", capped: true });
    expect(chargedCrewBps(LAST_HOLDER, { side: "sell", amount: ALL, sellerEligible: true })).toBe(0);
  });

  it("still charges it on a partial sale, while other holders remain, and to an excluded seller", () => {
    const half = ALL / BigInt(2);
    expect(chargedCrewBps(LAST_HOLDER, { side: "sell", amount: half, sellerEligible: true })).toBe(200);
    expect(BigInt(quoteTrade(LAST_HOLDER, "sell", half, 0).crewFee) > BigInt(0)).toBe(true);
    const shared = mission({ ...LAST_HOLDER, eligibleSupply: String(ALL * BigInt(2)) });
    expect(quoteTrade(shared, "sell", ALL, 0).crewFee).not.toBe("0");
    // An excluded seller's tokens were never in the eligible supply, so the holders who remain still earn.
    expect(quoteTrade(LAST_HOLDER, "sell", ALL, 0, { sellerEligible: false }).out).toBe("70137943993689");
  });

  it("keeps a buy's check before it trades, and charges nothing on a token without a Crew fee", () => {
    expect(chargedCrewBps(LAST_HOLDER, { side: "buy", amount: ALL, sellerEligible: true })).toBe(200);
    expect(chargedCrewBps(mission({ ...LAST_HOLDER, eligibleSupply: "0" }), { side: "buy", amount: BigInt(1), sellerEligible: true })).toBe(0);
    expect(quoteTrade(mission({ ...LAST_HOLDER, crewBps: 0 }), "sell", ALL / BigInt(3), 0).crewFee).toBe("0");
  });

  it("keeps the minimum the trader approved when the server checks again", () => {
    expect(quoteTrade(LAST_HOLDER, "sell", ALL, 100, { approvedMinOut: BigInt("69440000000000") }).minOut).toBe("69440000000000");
  });
});

describe("minimums and the page's figures", () => {
  it("sets the minimum from the slippage, rounding down, and never at zero", () => {
    expect(minimumOut(BigInt("26119201142461485199930760"), 100)).toBe(BigInt("25858009131036870347931452"));
    expect(minimumOut(BigInt(1_000), 50)).toBe(BigInt(995));
    expect(minimumOut(BigInt(1), 300)).toBe(BigInt(1));
    expect(minimumOut(BigInt(0), 100)).toBe(BigInt(1));
  });

  it("works the price, the cap and the curve's progress out from the reserves", () => {
    expect(tokenPrice(CURVE.virtualEth, CURVE.virtualTokens)).toBeCloseTo(1.78714880397639e-12, 24);
    expect(marketCap(CURVE.virtualEth, CURVE.virtualTokens)).toBe(BigInt("1787148803976390"));
    // 124,002,358.49 of the 800 million sold: 15.50%.
    expect(curveFilled(CURVE.tokensLeft)).toBeCloseTo(0.155002948, 5);
    expect(curveFilled(BigInt(0))).toBe(1);
  });
});

// The owner's lock: 99,201,886.79 tokens vesting over exactly 180 days from the launch block's time.
const START = 1_794_308_686;
const LOCK: DevLockState = { type: "linear", lockedBps: 8000, start: START, end: START + 180 * DAY_SECONDS, total: BigInt("99201886792452830188679245"), claimed: BigInt(0), checkpoint: BigInt(0) };

describe("a creator's lock, as the contract releases it", () => {
  it("vests a linear lock every second and everything at its end", () => {
    expect(claimableAt(LOCK, START)).toBe(BigInt(0));
    expect(claimableAt(LOCK, START + 90 * DAY_SECONDS)).toBe(LOCK.total / BigInt(2));
    expect(claimableAt(LOCK, START + DAY_SECONDS)).toBe((LOCK.total * BigInt(DAY_SECONDS)) / BigInt(180 * DAY_SECONDS));
    expect(claimableAt(LOCK, LOCK.end)).toBe(LOCK.total);
    expect(claimableAt(LOCK, LOCK.end + 999)).toBe(LOCK.total);
  });

  it("takes what was claimed off, and holds the rest back", () => {
    const half = LOCK.total / BigInt(2);
    const claimed = { ...LOCK, claimed: BigInt(1_000) * WEI };
    expect(claimableAt(claimed, START + 90 * DAY_SECONDS)).toBe(half - BigInt(1_000) * WEI);
    expect(lockedAt(claimed, START + 90 * DAY_SECONDS)).toBe(LOCK.total - half);
    expect(lockedAt(LOCK, LOCK.end)).toBe(BigInt(0));
  });

  it("releases nothing from a time-lock until its end", () => {
    const timed: DevLockState = { ...LOCK, type: "time" };
    expect(claimableAt(timed, timed.end - 1)).toBe(BigInt(0));
    expect(lockedAt(timed, timed.end - 1)).toBe(timed.total);
    expect(claimableAt(timed, timed.end)).toBe(timed.total);
  });

  it("extends from the later of now and the old end, and restarts a vest for what is left", () => {
    const now = START + 90 * DAY_SECONDS;
    const extended = extendLock(LOCK, now, 30 * DAY_SECONDS);
    expect(extended).toMatchObject({ start: now, end: LOCK.end + 30 * DAY_SECONDS, checkpoint: LOCK.total / BigInt(2) });
    if (typeof extended === "string") throw new Error(extended);
    // Half is claimable straight away; the other half vests over the 120 days now left.
    expect(claimableAt(extended, now)).toBe(LOCK.total / BigInt(2));
    expect(claimableAt(extended, now + 60 * DAY_SECONDS)).toBe(LOCK.total / BigInt(2) + (LOCK.total - LOCK.total / BigInt(2)) / BigInt(2));
    // Past its end, an unclaimed time-lock is locked again from now.
    const timed: DevLockState = { ...LOCK, type: "time" };
    expect(extendLock(timed, timed.end + 5 * DAY_SECONDS, 7 * DAY_SECONDS)).toMatchObject({ end: timed.end + 12 * DAY_SECONDS });
  });

  it("refuses an extension the contract would refuse", () => {
    expect(extendLock(LOCK, START, 6 * DAY_SECONDS)).toBe("short");
    expect(extendLock({ ...LOCK, type: "none" }, START, 30 * DAY_SECONDS)).toBe("none");
    expect(extendLock({ ...LOCK, claimed: LOCK.total }, START, 30 * DAY_SECONDS)).toBe("none");
    expect(extendLock(LOCK, LOCK.end, 30 * DAY_SECONDS)).toBe("vested");
  });
});
