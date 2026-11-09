/**
 * Token screens for the mock tokens the export doesn't detail (everything but
 * Ghosty), built from each token's own Explore figures with a seed from its
 * ticker, so a page always shows the same data.
 */
import type { Token } from "@/shared/types/token";
import { CHART_TIMEFRAMES, type ChartTimeframe, type TokenDetail, type WalletTag } from "@/shared/types/token-detail";
import { generateCandles, marksAt, TF_SECONDS, toCandles } from "./candles";
import { MOCK_NOW } from "./ghosty.mock";

/** The coins' USD prices in the export's status bar. */
const NATIVE_USD = { sol: 182.4, rh: 3_412 } as const;
const SUPPLY = 1_000_000_000;
const DAY = 86_400;

function seedOf(text: string): number {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 2_147_483_647;
  return h || 1;
}

/** A Park–Miller stream, like the export's. */
function stream(seed: number) {
  let s = seed;
  return () => (s = (s * 16_807) % 2_147_483_647) / 2_147_483_647;
}

const hex = (rnd: () => number, n: number) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join("");
const b58 = (rnd: () => number, n: number) => Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789"[Math.floor(rnd() * 57)]).join("");
const shortAddr = (token: Token, rnd: () => number) => (token.chain === "rh" ? `0x${hex(rnd, 4)}…${hex(rnd, 4)}` : `${b58(rnd, 4)}…${b58(rnd, 4)}`);

function chart(token: Token, rnd: () => number): TokenDetail["chart"] {
  const endK = token.marketCap / 1000;
  const native = NATIVE_USD[token.chain];
  const candles = {} as TokenDetail["chart"]["candles"];
  const marks = {} as TokenDetail["chart"]["marks"];
  for (const tf of CHART_TIMEFRAMES) {
    const count = tf === "1D" ? 19 : 62;
    const span = Math.min(count * TF_SECONDS[tf], token.ageMinutes * 60) / DAY;
    // The 24h change, stretched or shrunk to this window, kept to a believable range.
    const growth = Math.min(20, Math.max(0.2, (1 + token.change24h / 100) ** Math.min(span, 30)));
    const startK = endK / growth;
    const lerp = (f: number) => startK + (endK - startK) * f;
    const dips = [0.2, 0.45, 0.7, 0.9].map((f) => Math.round(f * (count - 1)) - 1 - Math.floor(rnd() * 3));
    const raw = generateCandles(
      { seed: seedOf(token.ticker + tf), count, anchors: [[0, startK], [0.3, lerp(0.25)], [0.6, lerp(0.55)], [0.85, lerp(0.85)], [1, endK]], dips, noise: 0.04, dip: 0.06 },
      endK,
    );
    const lastVolume = ((token.volume24h / native) * TF_SECONDS[tf] * 1.5) / DAY;
    candles[tf] = toCandles(raw, tf as ChartTimeframe, MOCK_NOW, Math.max(lastVolume, 0.01));
    marks[tf] = token.smartWallets > 0 ? marksAt(candles[tf], [[0.42, "smart"], [1, "smart"]]) : [];
  }
  const callout = token.smartWallets > 0 ? { trader: shortAddr(token, rnd), native: +(0.05 + rnd() * 0.5).toFixed(2), winRate: 0.6 + rnd() * 0.3 } : null;
  return { candles, marks, callout, graduationCap: token.curve < 1 ? Math.round(token.marketCap / Math.max(token.curve, 0.05) / 1000) * 1000 : null };
}

export function genericDetail(token: Token): TokenDetail {
  const rnd = stream(seedOf(token.ticker));
  const native = NATIVE_USD[token.chain];
  const priceUsd = token.marketCap / SUPPLY;
  const tonk = token.launchpad === "tonk";
  const crewPct = tonk && token.flags.crew ? parseFloat(token.flags.crew) : null;
  const tags: Array<WalletTag | null> = [null, "smart", null, "whale", null, "sniper", null, null, null, "smart", null, null, "whale", null, null, null];
  const ages = [3, 9, 15, 24, 33, 47, 58, 75, 92, 118, 140, 171, 205, 248, 301, 362];
  const trades = tags.map((tag, i) => {
    const usd = 20 + rnd() * 600;
    const side: "buy" | "sell" = rnd() < 0.7 ? "buy" : "sell";
    const trader = shortAddr(token, rnd);
    return { id: `${trader}-${i}`, ageSeconds: ages[i], side, usd, native: usd / native, tokens: usd / priceUsd, marketCap: token.marketCap * (1 - i * 0.004), trader, tag, txUrl: null };
  });
  const curveShare = token.curve < 1 ? 0.8 * (1 - token.curve) : 0;
  const holders = [
    ...(curveShare > 0 ? [{ address: null, tag: "curve" as const, share: curveShare, tokens: curveShare * SUPPLY, crewEarned: null }] : []),
    ...[0.034, 0.026, 0.018, 0.012, 0.009, 0.008, 0.007, 0.006, 0.005].map((share, i) => ({
      address: shortAddr(token, rnd),
      tag: (["smart", "whale", null, "sniper", null, null, null, null, null] as const)[i],
      share,
      tokens: share * SUPPLY,
      crewEarned: crewPct ? share * token.volume24h * (crewPct / 100) : null,
    })),
  ];
  const topTraders = [0.84, 0.71, 0.66, 0.58, 0.52, 0.49, 0.45, 0.4].map((winRate, i) => {
    const bought = 100 + rnd() * 1_500;
    const tag = (["smart", "whale", null, "sniper", null, null, null, null] as const)[i];
    return { address: shortAddr(token, rnd), tag, pnlUsd: bought * (1.2 - i * 0.18), boughtUsd: bought, soldUsd: bought * (2.2 - i * 0.18), winRate };
  });
  return {
    token,
    contract: token.chain === "rh" ? `0x${hex(rnd, 40)}` : b58(rnd, 44),
    launchedAt: MOCK_NOW - token.ageMinutes * 60_000,
    priceUsd,
    supply: SUPPLY,
    description: null,
    links: { website: null, community: null },
    stats: { txns24h: Math.round(token.volume24h / 145), liquidity: +((token.marketCap * 0.14) / native).toFixed(1), liquidityIn: token.curve < 1 ? "curve" : "pool", holdersChange1h: Math.round((token.holders ?? 0) * 0.06), top10Share: 0.12 + rnd() * 0.25 },
    chart: chart(token, rnd),
    flow1h: { buys: Math.round(token.volume24h / 230), sells: Math.round(token.volume24h / 410) },
    trades,
    holders,
    topTraders,
    curve: token.curve < 1 ? shortAddr(token, rnd) : null,
    feePct: tonk ? 2.5 : null,
    devLock:
      tonk && token.flags.locked
        ? { share: 0.7, vestDays: 120, unlocks: 4, startedAt: MOCK_NOW - token.ageMinutes * 60_000, elapsedDays: Math.floor(token.ageMinutes / 1_440), nextUnlockDays: 30 - (Math.floor(token.ageMinutes / 1_440) % 30), contract: shortAddr(token, rnd), contractUrl: null }
        : null,
    crew: tonk && crewPct ? { paidUsd: Math.round(token.volume24h * (crewPct / 100) * 3), sharePct: crewPct, lastPayoutSeconds: 6, daily: Array.from({ length: 14 }, (_, i) => Math.round((token.volume24h * (crewPct / 100)) * (0.4 + (i / 13) * 0.6 + rnd() * 0.2))) } : null,
    agent: token.flags.agent ? { name: `Captain ${token.name}` } : null,
    nativeUsd: native,
    updatedAt: MOCK_NOW,
  };
}
