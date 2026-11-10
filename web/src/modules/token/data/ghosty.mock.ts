/**
 * Ghosty's token screen, ported from the owner's export (token.dc.html): the
 * `CH` candle recipes, the trades, holders, top traders, stats, telemetry and
 * crew payouts. Shortened addresses are as the export shows them.
 */
import { TOKENS } from "@/shared/data/mock-tokens";
import { CHART_TIMEFRAMES, type ChartTimeframe, type TokenDetail } from "@/shared/types/token-detail";
import { type CandleRecipe, generateCandles, marksAt, toCandles } from "./candles";

/** The moment the export describes: 5 Nov 2026, 21:30 UTC (its axis labels line up with it). */
export const MOCK_NOW = Date.UTC(2026, 10, 5, 21, 30);

const RECIPES: Record<ChartTimeframe, CandleRecipe> = {
  "1m": { seed: 11, count: 62, anchors: [[0, 50.6], [0.25, 52.4], [0.5, 54.1], [0.75, 56.3], [1, 58.2]], dips: [9, 21, 22, 37, 50], noise: 0.012, dip: 0.02 },
  "5m": { seed: 23, count: 62, anchors: [[0, 34.2], [0.3, 41.8], [0.6, 48.9], [0.85, 55.1], [1, 58.2]], dips: [12, 26, 27, 44, 55], noise: 0.02, dip: 0.035 },
  "15m": { seed: 7, count: 62, anchors: [[0, 12.8], [0.3, 19.6], [0.55, 31.5], [0.8, 47.2], [1, 58.2]], dips: [14, 27, 28, 41, 49, 57], noise: 0.05, dip: 0.07 },
  "1h": { seed: 31, count: 62, anchors: [[0, 6.3], [0.4, 8.4], [0.613, 11.4], [0.8, 33.6], [1, 58.2]], dips: [10, 23, 35, 44, 53], noise: 0.05, dip: 0.08 },
  "4h": { seed: 43, count: 62, anchors: [[0, 4.4], [0.5, 7.2], [0.85, 9.6], [0.903, 11.4], [0.95, 31], [1, 58.2]], dips: [8, 19, 31, 42, 50], noise: 0.05, dip: 0.09 },
  "1D": { seed: 5, count: 19, anchors: [[0, 2.4], [0.35, 6.1], [0.7, 8.2], [0.944, 11.4], [1, 58.2]], dips: [4, 9, 13], noise: 0.06, dip: 0.12 },
};

/** The readout's volume per timeframe, in ETH (`VOL`). */
const LAST_VOLUME: Record<ChartTimeframe, number> = { "1m": 0.18, "5m": 0.74, "15m": 2.14, "1h": 6.92, "4h": 21.6, "1D": 54.5 };

/** W and S marks at the export's positions (`mkAt`). */
const MARK_SPOTS = [[0.18, "whale"], [0.42, "smart"], [0.66, "smart"], [1, "smart"]] as const;

function chart(): TokenDetail["chart"] {
  const candles = {} as TokenDetail["chart"]["candles"];
  const marks = {} as TokenDetail["chart"]["marks"];
  for (const tf of CHART_TIMEFRAMES) {
    candles[tf] = toCandles(generateCandles(RECIPES[tf], 58.2), tf, MOCK_NOW, LAST_VOLUME[tf]);
    marks[tf] = marksAt(candles[tf], MARK_SPOTS);
  }
  return { candles, marks, callout: { trader: "0x7f3a…e8d1", native: 0.27, winRate: 0.82 }, graduationCap: 70_000 };
}

const ghost = TOKENS.find((t) => t.ticker === "GHOST");
if (!ghost) throw new Error("GHOST is missing from the mock tokens");

type Row<T> = T extends ReadonlyArray<infer R> ? R : never;
const trade = (
  ageSeconds: number,
  side: "buy" | "sell",
  usd: number,
  native: number,
  tokens: number,
  marketCap: number,
  trader: string,
  tag: Row<TokenDetail["trades"]>["tag"],
): Row<TokenDetail["trades"]> => ({ id: `${trader}-${ageSeconds}`, ageSeconds, side, usd, native, tokens, marketCap, trader, tag, txUrl: null });

export const GHOSTY: TokenDetail = {
  token: ghost,
  contract: "0x5e1d7c4b92a03f6e18d5b7c2a94e6f01d3c8a0f3",
  launchedAt: Date.UTC(2026, 9, 18, 14, 22),
  priceUsd: 0.0000582,
  supply: 1_000_000_000,
  description:
    "A friendly ghost haunting the timeline, launched natively on tonkfun.fun. The dev allocation is locked for 180 days, holders earn 2% of every trade, and Captain Boo answers questions from live on-chain data.",
  // The export shows both buttons; .example is a reserved domain, so these never reach a real site.
  links: { website: "https://ghosty.example", community: "https://community.ghosty.example" },
  stats: { txns24h: 1_284, liquidity: 8.4, liquidityIn: "curve", holdersChange1h: 96, top10Share: 0.182 },
  chart: chart(),
  flow1h: { buys: 812, sells: 472 },
  trades: [
    trade(2, "buy", 182.4, 0.0535, 3_130_000, 58_200, "0x4f2a…9b1c", "smart"),
    trade(6, "buy", 45.6, 0.0134, 784_000, 58_000, "0x9a1e…71d4", null),
    trade(11, "sell", 364.8, 0.1069, 6_270_000, 57_600, "0xb27c…02e5", null),
    trade(14, "buy", 912, 0.2673, 15_700_000, 57_900, "0x7f3a…e8d1", "smart"),
    trade(21, "buy", 18.24, 0.0053, 313_000, 56_800, "0xcc1e…4a6f", null),
    trade(38, "buy", 273.6, 0.0802, 4_810_000, 56_400, "0x2e9b…7f30", "sniper"),
    trade(52, "sell", 54.72, 0.016, 963_000, 55_900, "0xd4e1…3b9a", null),
    trade(60, "buy", 637, 0.1867, 11_400_000, 55_600, "0xa0f5…e9c2", "whale"),
    // Older trades behind "Show more" (the export shows the first eight).
    trade(75, "buy", 91.2, 0.0267, 1_650_000, 55_400, "0x3d7e…c41a", null),
    trade(96, "sell", 228, 0.0668, 4_120_000, 55_300, "0x8b20…5fe7", null),
    trade(118, "buy", 410.4, 0.1203, 7_390_000, 55_500, "0x4f2a…9b1c", "smart"),
    trade(143, "buy", 27.36, 0.008, 497_000, 55_100, "0xe61c…0d28", null),
    trade(171, "buy", 136.8, 0.0401, 2_490_000, 54_900, "0x5ac3…92bf", null),
    trade(204, "sell", 547.2, 0.1604, 10_000_000, 54_700, "0xa0f5…e9c2", "whale"),
    trade(239, "buy", 63.84, 0.0187, 1_160_000, 55_000, "0x1f9d…a3e6", null),
    trade(281, "buy", 319.2, 0.0936, 5_850_000, 54_600, "0x2e9b…7f30", "sniper"),
  ],
  holders: [
    { address: null, tag: "curve", share: 0.58, tokens: 580_000_000, crewEarned: null },
    { address: "0x91c4…b7e2", tag: "devLock", share: 0.08, tokens: 80_000_000, crewEarned: null },
    { address: "0x7f3a…e8d1", tag: "smart", share: 0.029, tokens: 29_400_000, crewEarned: 412.1 },
    { address: "0xa0f5…e9c2", tag: "whale", share: 0.024, tokens: 24_100_000, crewEarned: 338.6 },
    { address: "0x4f2a…9b1c", tag: "smart", share: 0.016, tokens: 16_200_000, crewEarned: 227.4 },
    { address: "0x2e9b…7f30", tag: "sniper", share: 0.011, tokens: 11_300_000, crewEarned: 158.7 },
    { address: "0x9a1e…71d4", tag: null, share: 0.0094, tokens: 9_400_000, crewEarned: 133.6 },
    { address: "0xb27c…02e5", tag: null, share: 0.0081, tokens: 8_100_000, crewEarned: 115.1 },
    { address: "0xcc1e…4a6f", tag: null, share: 0.0068, tokens: 6_800_000, crewEarned: 96.6 },
    { address: "0xd4e1…3b9a", tag: null, share: 0.0055, tokens: 5_500_000, crewEarned: 78.2 },
  ],
  topTraders: [
    { address: "0x7f3a…e8d1", tag: "smart", pnlUsd: 4_812, boughtUsd: 912, soldUsd: 5_724, winRate: 0.82 },
    { address: "0xa0f5…e9c2", tag: "whale", pnlUsd: 2_906, boughtUsd: 1_840, soldUsd: 4_746, winRate: 0.74 },
    { address: "0x4f2a…9b1c", tag: "smart", pnlUsd: 1_377, boughtUsd: 364, soldUsd: 1_741, winRate: 0.76 },
    { address: "0x2e9b…7f30", tag: "sniper", pnlUsd: 904, boughtUsd: 274, soldUsd: 1_178, winRate: 0.61 },
    { address: "0x9a1e…71d4", tag: null, pnlUsd: 212, boughtUsd: 46, soldUsd: 258, winRate: 0.55 },
    { address: "0x3d7e…c41a", tag: null, pnlUsd: 168, boughtUsd: 91, soldUsd: 259, winRate: 0.52 },
    { address: "0x5ac3…92bf", tag: null, pnlUsd: 97, boughtUsd: 137, soldUsd: 234, winRate: 0.5 },
    { address: "0xb27c…02e5", tag: null, pnlUsd: -64, boughtUsd: 429, soldUsd: 365, winRate: 0.41 },
  ],
  curve: "0x3c0b…77e4",
  feePct: 2.5,
  devLock: {
    share: 0.8,
    vestDays: 180,
    unlocks: 6,
    startedAt: Date.UTC(2026, 9, 18, 14, 22),
    elapsedDays: 18,
    nextUnlockDays: 12,
    contract: "0x91c4…b7e2",
    contractUrl: null,
  },
  crew: {
    paidUsd: 14_280,
    sharePct: 2,
    lastPayoutSeconds: 4,
    daily: [378, 549, 342, 801, 1_089, 684, 846, 1_242, 1_008, 882, 1_314, 1_548, 1_377, 1_719],
  },
  agent: { name: "Captain Boo" },
  nativeUsd: 3_412,
  updatedAt: MOCK_NOW,
};
