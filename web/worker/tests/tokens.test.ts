// @vitest-environment node
import { describe, expect, it } from "vitest";
import { refreshDelay } from "../src/schedule";
import { holderPoints, liquidityShare, missionScore } from "../src/score";
import { buysLast15m, sampleSeries, toToken } from "../src/tokens";
import { HOUR, MIN, NOW, priced, SEC, tracked, windows } from "./fixtures";

describe("refreshDelay", () => {
  it("refreshes new tokens fast and quiet ones slowly", () => {
    const active = windows({ h1: { buys: 3 } });
    expect(refreshDelay(tracked({}, 5 * MIN), NOW)).toBe(8 * SEC);
    expect(refreshDelay(tracked({ windows: active }, 30 * MIN), NOW)).toBe(15 * SEC);
    expect(refreshDelay(tracked({}, 30 * MIN), NOW)).toBe(MIN);
    expect(refreshDelay(tracked({ windows: active, marketCap: 50_000 }, 3 * HOUR), NOW)).toBe(30 * SEC);
    expect(refreshDelay(tracked({ windows: active, marketCap: 5_000 }, 3 * HOUR), NOW)).toBe(2 * MIN);
    expect(refreshDelay(tracked({ marketCap: 25_000 }, 3 * HOUR), NOW)).toBe(5 * MIN);
    expect(refreshDelay(tracked({ marketCap: 3_000 }, 3 * HOUR), NOW)).toBe(20 * MIN);
  });
});

describe("missionScore", () => {
  it("starts new tokens with unknown facts as Risky", () => {
    expect(missionScore(tracked({}, 2 * MIN), NOW)).toEqual({ score: 40, level: "Risky" });
  });

  it("rewards given-up authorities, graduation, healthy trading and volume", () => {
    const token = tracked({
      mintRevoked: true,
      freezeRevoked: true,
      graduated: true,
      windows: windows({ h1: { buys: 40, sells: 20 }, h24: { volume: 80_000 } }),
    });
    expect(missionScore(token, NOW)).toEqual({ score: 90, level: "Safe" });
  });

  it("punishes kept authorities, a big creator buy and a crash, and stays within 1–99", () => {
    const token = tracked({ mintRevoked: false, freezeRevoked: false, creatorBuyShare: 0.3, windows: windows({ h1: { change: -80 } }) }, 2 * MIN);
    expect(missionScore(token, NOW)).toEqual({ score: 1, level: "Risky" });
    expect(missionScore(tracked({ mintRevoked: true, freezeRevoked: false }), NOW).level).toBe("Risky");
    expect(missionScore(tracked({ mintRevoked: true, freezeRevoked: true, creatorBuyShare: 0.08 }), NOW)).toEqual({ score: 57, level: "Caution" });
  });
});

describe("missionScore and pool liquidity", () => {
  // Graduated, authorities given up, healthy trading and volume: 90 before liquidity counts.
  const solid = (marketCap: number, liquidityUsd: number | null) =>
    tracked({
      mintRevoked: true,
      freezeRevoked: true,
      graduated: true,
      marketCap,
      liquidityUsd,
      windows: windows({ h1: { buys: 40, sells: 20 }, h24: { volume: 80_000 } }),
    });

  it("caps a valuation the pool can't back at Risky, like USDF's $1.1M pool under a $191M market cap", () => {
    expect(missionScore(solid(191_600_000, 1_101_000), NOW)).toEqual({ score: 30, level: "Risky" });
  });

  it("takes points off a thin pool and leaves a healthy one alone", () => {
    expect(missionScore(solid(1_000_000, 40_000), NOW)).toEqual({ score: 70, level: "Caution" });
    expect(missionScore(solid(1_000_000, 150_000), NOW).score).toBe(90);
  });

  it("skips the check when liquidity is unknown or the token is too small to judge", () => {
    expect(missionScore(solid(1_000_000, null), NOW).score).toBe(90);
    expect(missionScore(solid(15_000, 100), NOW).score).toBe(90);
    expect(liquidityShare(solid(15_000, 100))).toBeNull();
    expect(liquidityShare(solid(100_000, 5_000))).toBeCloseTo(0.05, 12);
  });
});

describe("missionScore and the top-10 wallets", () => {
  // Authorities given up, two hours old, no trading facts: 65 before holders count.
  const held = (share: number | null, marketCap = 48_000) =>
    priced(marketCap, {}, { mintRevoked: true, freezeRevoked: true, top10Share: share }, 2 * HOUR);

  it("takes 20 points over 50%, 10 from 30% to 50%, and adds 5 under 20%", () => {
    expect(missionScore(held(null), NOW)).toEqual({ score: 65, level: "Caution" });
    expect(missionScore(held(0.62), NOW).score).toBe(45);
    expect(missionScore(held(0.5), NOW).score).toBe(55);
    expect(missionScore(held(0.3), NOW).score).toBe(55);
    expect(missionScore(held(0.25), NOW).score).toBe(65);
    expect(missionScore(held(0.04), NOW).score).toBe(70);
  });

  it("ignores holders under a $20K valuation, where the data is too noisy", () => {
    expect(holderPoints(held(0.9, 15_000))).toBe(0);
    expect(missionScore(held(0.9, 15_000), NOW).score).toBe(65);
  });
});

describe("missionScore and verified issuers", () => {
  // Authorities held, the creator owns 90%, the top 10 hold 95%, and the pool is tiny.
  const risky = { mintRevoked: false, freezeRevoked: false, creatorBuyShare: 0.9, top10Share: 0.95, liquidityUsd: 1_000 };

  it("counts a verified issuer's authorities +15 and skips the creator-buy, holder and pool checks", () => {
    expect(missionScore(priced(500_000, {}, risky, 2 * HOUR), NOW)).toEqual({ score: 1, level: "Risky" });
    expect(missionScore(priced(500_000, {}, { ...risky, issuerClaim: "xstocks", issuer: "xstocks" }, 2 * HOUR), NOW)).toEqual({
      score: 65,
      level: "Caution",
    });
  });

  it("needs Jupiter's confirmation, not just matching authorities", () => {
    expect(missionScore(priced(500_000, {}, { ...risky, issuerClaim: "ondo", issuer: null }, 2 * HOUR), NOW).score).toBe(1);
  });
});

describe("buysLast15m", () => {
  it("counts every buy while the token is under 15 minutes old", () => {
    expect(buysLast15m(tracked({ windows: windows({ h24: { buys: 33 } }) }, 10 * MIN), NOW)).toBe(33);
  });

  it("subtracts the count from 15 minutes ago", () => {
    const token = tracked({
      windows: windows({ h24: { buys: 100 } }),
      buySamples: [
        [NOW - 20 * MIN, 50],
        [NOW - 16 * MIN, 60],
        [NOW - 5 * MIN, 90],
      ],
    });
    expect(buysLast15m(token, NOW)).toBe(40);
  });

  it("estimates from the 5m and 1h counts when no sample is old enough", () => {
    const token = tracked({ windows: windows({ m5: { buys: 4 }, h1: { buys: 60 }, h24: { buys: 200 } }), buySamples: [[NOW - MIN, 199]] });
    expect(buysLast15m(token, NOW)).toBe(15);
  });
});

describe("sampleSeries", () => {
  it("needs two points to draw anything", () => {
    expect(sampleSeries([])).toEqual([]);
    expect(sampleSeries([[NOW, 5]])).toEqual([]);
  });

  it("takes evenly timed steps through the history", () => {
    const series: Array<[number, number]> = [
      [0, 1],
      [10, 2],
      [30, 3],
    ];
    expect(sampleSeries(series, 4)).toEqual([1, 2, 2, 3]);
    expect(sampleSeries(series)).toHaveLength(26);
  });
});

describe("toToken", () => {
  it("maps a tracked token onto the app's Token", () => {
    const token = priced(
      48_000,
      { m5: { change: 3, volume: 900 }, h1: { change: 40 }, h24: { change: 210, volume: 61_000 } },
      { symbol: "", name: "", image: "https://cdn.test/a.png", graduated: true, curve: 0.4 },
      12 * MIN,
    );
    const out = toToken(token, NOW, true);
    expect(out).toMatchObject({
      address: token.address,
      ticker: "???",
      curve: 1,
      change24h: 210,
      volume24h: 61_000,
      holders: null,
      marketCap: 48_000,
      ageMinutes: 12,
      art: "https://cdn.test/a.png",
      flags: { hot: true, isNew: true, locked: false, crew: null },
    });
    expect(out.name).toBe(`${token.address.slice(0, 4)}…${token.address.slice(-4)}`);
    expect(out.windows?.["5m"]).toEqual({ change: 3, volume: 900 });
    expect(out).not.toHaveProperty("issuer");
  });

  it("shows the holder count once it is known", () => {
    expect(toToken(tracked({ holderCount: 2_517 }), NOW).holders).toBe(2_517);
    expect(toToken(tracked({ holderCount: null }), NOW).holders).toBeNull();
    expect(toToken(tracked({ smartCount: 2 }), NOW).smartWallets).toBe(2);
  });

  it("names a verified issuer, which shows the Verified RWA badge", () => {
    expect(toToken(tracked({ issuerClaim: "ondo", issuer: "ondo" }), NOW).issuer).toBe("Ondo Global Markets");
    expect(toToken(tracked({ issuerClaim: "ondo", issuer: null }), NOW)).not.toHaveProperty("issuer");
  });
});
