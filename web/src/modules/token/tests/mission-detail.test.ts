import { describe, expect, it } from "vitest";
import type { MissionTradeJson } from "@/shared/tonk/mission";
import { TONK_TESTNET } from "@/shared/tonk/networks";
import { newerPage } from "../hooks/useMissionPage";
import { candlesFrom, missionDetail } from "../lib/mission-detail";
import { coinAmount } from "../lib/money";
import { CREATOR, DAY, LAUNCH_BUY, LAUNCHED, mission, TOKEN } from "./mission.fixture";

/** A later sale of 10,000,000 tokens: 0.0000176851 test ETH gross, the reserves the contract left after it. */
const SALE: MissionTradeJson = {
  id: `0x${"5e".repeat(32)}:1`,
  tx: `0x${"5e".repeat(32)}`,
  side: "sell",
  trader: "0x3333333333333333333333333333333333333333",
  eth: "17685132127443",
  tokens: "10000000000000000000000000",
  fees: "707405285096",
  virtualEth: "1678314867872557",
  virtualTokens: "958997641509433962264150943",
  block: 151_325_000,
  time: LAUNCHED + 3_000,
};

describe("a mission as the token page shows it", () => {
  const detail = missionDetail({ mission: mission(), trades: [LAUNCH_BUY] }, TONK_TESTNET);

  it("counts every figure in the chain's coin, from the curve's own reserves", () => {
    expect(detail.source).toBe("live");
    expect(detail.token).toMatchObject({ address: TOKEN, name: "Tonk Test One", ticker: "TTONE", chain: "rh", launchpad: "tonk", holders: null, art: "" });
    // Price = vEth ÷ vTokens; cap = price × 1B; filled = (800M − left) ÷ 800M.
    expect(detail.priceUsd).toBeCloseTo(1.78715e-12, 16);
    expect(detail.token.marketCap).toBeCloseTo(0.00178715, 8);
    expect(detail.token.curve).toBeCloseTo(0.155003, 5);
    expect(detail.supply).toBe(1_000_000_000);
    expect(detail.nativeUsd).toBeNull();
    expect(detail.stats).toMatchObject({ txns24h: 1, liquidity: 0.000196, liquidityIn: "curve", holdersChange1h: null, top10Share: null });
    expect(detail.token.volume24h).toBeCloseTo(0.0002, 12);
  });

  it("measures the day's change from the cap before the day's first trade: since launch for a young token", () => {
    // The launch buy moved the cap from 0.0015 × 1B ÷ 1.073B to today's.
    expect(detail.token.change24h).toBeCloseTo(27.84, 1);
    const quiet = missionDetail({ mission: mission({ readAt: (LAUNCHED + 3 * DAY) * 1000 }), trades: [LAUNCH_BUY] }, TONK_TESTNET);
    expect([quiet.token.change24h, quiet.token.volume24h, quiet.stats.txns24h, quiet.flow1h]).toEqual([0, 0, 0, { buys: 0, sells: 0 }]);
  });

  it("lists the trades newest first with the cap each one left, in the coin, and never a dollar figure", () => {
    const both = missionDetail({ mission: mission(), trades: [SALE, LAUNCH_BUY] }, TONK_TESTNET);
    expect(both.trades.map((trade) => [trade.side, trade.usd, trade.native, trade.tokens, trade.trader, trade.ageSeconds])).toEqual([
      ["sell", null, 0.000017685132127443, 10_000_000, SALE.trader, 1_200],
      ["buy", null, 0.0002, 124_002_358.490566, CREATOR, 4_200],
    ]);
    expect(both.trades[1].marketCap).toBeCloseTo(0.00178715, 8);
    expect(both.trades[1].txUrl).toBe(`${TONK_TESTNET.explorerUrl}/tx/${LAUNCH_BUY.tx}`);
    expect(both.flow1h).toEqual({ buys: 0, sells: 1 });
    expect([both.holders, both.topTraders]).toEqual([[], []]);
  });

  it("scores the mission from chain facts and marks what the chain supports", () => {
    expect([detail.token.score, detail.token.level]).toEqual([80, "Safe"]);
    expect(detail.token.flags).toMatchObject({ locked: true, crew: "2%", agent: false, isNew: true });
    expect(detail.devLock).toMatchObject({ share: 0.8, vestDays: 180, elapsedDays: 0, unlocks: (LAUNCHED + 180 * DAY) * 1000 });
    expect(detail.crew).toMatchObject({ sharePct: 2, paidUsd: 0 });
    expect(detail.feePct).toBe(4);
    // No agent answers yet, so nothing on the page says one is live; the header's Agent mark follows the stored brief.
    const briefed = missionDetail({ mission: mission({ agentPrompt: '{"v":1,"name":"Astro","role":"Commander","voice":"hype","brief":"Hi."}' }), trades: [LAUNCH_BUY] }, TONK_TESTNET);
    expect([briefed.agent, briefed.token.flags.agent]).toEqual([null, true]);
  });

  it("drops the lock's marks once it has run out, and the Crew mark under 1%", () => {
    const later = missionDetail({ mission: mission({ readAt: (LAUNCHED + 176 * DAY) * 1000, crewBps: 50 }), trades: [LAUNCH_BUY] }, TONK_TESTNET);
    expect(later.token.flags).toMatchObject({ locked: false, crew: null, isNew: false });
    expect(later.crew).toBeNull();
    const none = missionDetail({ mission: mission({ lock: null }), trades: [LAUNCH_BUY] }, TONK_TESTNET);
    // 12.4% bought and nothing locked: the unlocked-buy penalty, and no lock points.
    expect([none.devLock, none.token.score, none.token.flags.locked]).toEqual([null, 62, false]);
  });

  it("shows stored details only when they are the app's own safe JSON", () => {
    const stored = missionDetail({ mission: mission({ metadata: '{"v":1,"description":"First test launch.","x":"tonkfun","website":"https://tonkfun.fun/"}' }), trades: [] }, TONK_TESTNET);
    expect([stored.description, stored.links]).toEqual(["First test launch.", { website: "https://tonkfun.fun/", community: "https://x.com/tonkfun" }]);
    const hostile = missionDetail({ mission: mission({ metadata: '{"v":1,"description":"<img src=x onerror=alert(1)>","website":"javascript:alert(1)","telegram":"https://evil.example/t.me"}' }), trades: [] }, TONK_TESTNET);
    // Text stays text (React escapes it); anything that isn't a plain web or Telegram link is dropped.
    expect([hostile.description, hostile.links]).toEqual(["<img src=x onerror=alert(1)>", { website: null, community: null }]);
    expect(missionDetail({ mission: mission({ metadata: "ipfs://not-json" }), trades: [] }, TONK_TESTNET).description).toBeNull();
  });

  it("is Graduated once the curve is complete: no curve liquidity to show", () => {
    const done = missionDetail({ mission: mission({ graduated: true, tokensLeft: "0" }), trades: [LAUNCH_BUY] }, TONK_TESTNET);
    expect([done.token.curve, done.stats.liquidity, done.stats.liquidityIn, done.curve]).toEqual([1, null, "pool", null]);
  });
});

describe("a mission on mainnet, where the page counts in dollars", () => {
  const page = { mission: mission(), trades: [LAUNCH_BUY, SALE] };
  const inCoin = missionDetail(page, TONK_TESTNET);

  it("turns every market figure into dollars at the coin's price, and keeps liquidity and trade sizes in the coin", () => {
    const detail = missionDetail(page, TONK_TESTNET, 3000);
    expect(detail.priceUsd).toBeCloseTo((inCoin.priceUsd ?? 0) * 3000, 12);
    expect(detail.token.marketCap).toBeCloseTo(inCoin.token.marketCap * 3000, 6);
    expect(detail.token.volume24h).toBeCloseTo(inCoin.token.volume24h * 3000, 6);
    expect(detail.token.series).toEqual((inCoin.token.series ?? []).map((value) => value * 3000));
    expect(detail.token.change24h).toBeCloseTo(inCoin.token.change24h, 9);
    expect(detail.stats.liquidity).toBe(inCoin.stats.liquidity);
    expect(detail.nativeUsd).toBe(3000);
    expect(detail.marketAvailable).toBeUndefined();
    detail.trades.forEach((trade, index) => {
      const coin = inCoin.trades[index];
      expect(trade.native).toBe(coin.native);
      expect(trade.usd).toBeCloseTo((coin.native ?? 0) * 3000, 9);
      expect(trade.marketCap).toBeCloseTo((coin.marketCap ?? 0) * 3000, 6);
    });
    const [candle] = detail.chart.candles["1h"];
    const [coinCandle] = inCoin.chart.candles["1h"];
    expect(candle.close).toBeCloseTo(coinCandle.close * 3000, 6);
    expect(candle.volume).toBeCloseTo(coinCandle.volume * 3000, 6);
  });

  it("shows the market as unavailable while there is no price, never ETH under a dollar sign", () => {
    const detail = missionDetail(page, TONK_TESTNET, null);
    expect(detail.marketAvailable).toBe(false);
    expect(detail.priceUsd).toBeNull();
    expect(detail.token.marketCap).toBe(0);
    expect(detail.nativeUsd).toBeNull();
    expect(Object.values(detail.chart.candles).every((candles) => candles.length === 0)).toBe(true);
    expect(detail.trades.every((trade) => trade.usd === null && trade.marketCap === null && trade.native !== null)).toBe(true);
    expect(missionDetail(page, TONK_TESTNET, Number.NaN).marketAvailable).toBe(false);
  });

  it("leaves the testnet site's figures in the coin, exactly as before", () => {
    expect(inCoin.marketAvailable).toBeUndefined();
    expect(inCoin.nativeUsd).toBeNull();
    expect(inCoin.trades.every((trade) => trade.usd === null)).toBe(true);
  });
});

describe("candles from a mission's trades", () => {
  it("opens at the cap before the first trade, fills quiet stretches flat and runs up to now", () => {
    const candles = candlesFrom([LAUNCH_BUY, SALE], 900, LAUNCHED + 4_200);
    const first = Math.floor(LAUNCHED / 900) * 900;
    expect(candles[0]).toMatchObject({ time: first, volume: 0.0002 });
    expect(candles[0].open).toBeCloseTo(0.00139795, 8);
    expect(candles[0].close).toBeCloseTo(0.00178715, 8);
    expect([candles[0].low, candles[0].high]).toEqual([candles[0].open, candles[0].close]);
    // Every 15 minutes from the launch to now is there, with no gaps.
    expect(candles.map((candle) => candle.time)).toEqual(Array.from({ length: candles.length }, (_, i) => first + i * 900));
    expect(candles[candles.length - 1].time).toBe(Math.floor((LAUNCHED + 4_200) / 900) * 900);
    const quiet = candles[1];
    expect([quiet.open, quiet.high, quiet.low, quiet.close, quiet.volume]).toEqual([candles[0].close, candles[0].close, candles[0].close, candles[0].close, 0]);
    // The sale's candle falls from the cap before it to the cap after it.
    const sold = candles.find((candle) => candle.time === Math.floor(SALE.time / 900) * 900);
    expect(sold?.volume).toBeCloseTo(0.0000176851, 10);
    expect(sold && sold.close < sold.open).toBe(true);
  });

  it("is empty with no trades, and keeps to the newest 400 candles", () => {
    expect(candlesFrom([], 60, LAUNCHED)).toEqual([]);
    expect(candlesFrom([LAUNCH_BUY], 60, LAUNCHED + 10 * DAY)).toHaveLength(400);
  });
});

describe("a newer read of the same mission", () => {
  const read = (block: number) => ({ mission: mission({ block }), trades: [LAUNCH_BUY] });

  it("never steps back to an older block, but always takes the latest trades", () => {
    expect(newerPage(null, read(5)).mission.block).toBe(5);
    expect(newerPage(read(5), read(7)).mission.block).toBe(7);
    const kept = newerPage(read(9), { mission: mission({ block: 7 }), trades: [SALE, LAUNCH_BUY] });
    expect([kept.mission.block, kept.trades.length]).toEqual([9, 2]);
  });
});

describe("a coin amount", () => {
  it("keeps four significant digits, and counts the zeros of the very small", () => {
    expect([coinAmount(1.78715e-12), coinAmount(0.00178715), coinAmount(0.0002), coinAmount(12.5), coinAmount(1234.5678), coinAmount(0), coinAmount(0.000196)]).toEqual([
      "0.0₁₁1787",
      "0.001787",
      "0.0002",
      "12.5",
      "1,235",
      "0",
      "0.000196",
    ]);
    expect(coinAmount(-0.5)).toBe("−0.5");
  });
});
