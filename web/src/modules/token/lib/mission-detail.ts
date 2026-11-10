import { curveFilled, marketCap, tokenPrice, TOTAL_SUPPLY } from "@/shared/tonk/curve";
import { DAY_SECONDS, lockedAt } from "@/shared/tonk/lock";
import { decodeAgent, decodeMetadata } from "@/shared/tonk/metadata";
import { type MissionJson, missionLock, type MissionPageJson, type MissionTradeJson } from "@/shared/tonk/mission";
import { explorerAddressUrl, explorerTxUrl, type TonkNetwork } from "@/shared/tonk/networks";
import { isLockedMission, missionScore } from "@/shared/tonk/score";
import { type Candle, CHART_TIMEFRAMES, type ChartTimeframe, type DevLock, type TokenDetail, type TokenTrade } from "@/shared/types/token-detail";
import { TF_SECONDS } from "../data/candles";
import { shortAddress } from "./format";

/** The most candles one timeframe carries; older ones wait for the indexer. */
const MAX_CANDLES = 400;
const HOUR = 3_600;

const eth = (wei: string | bigint) => Number(BigInt(wei)) / 1e18;
const tokens = (wei: string | bigint) => Number(BigInt(wei) / BigInt(10) ** BigInt(12)) / 1e6;
const capOf = (virtualEth: bigint, virtualTokens: bigint) => eth(marketCap(virtualEth, virtualTokens));

/** A trade's market cap just before and just after it, in the coin, from the reserves its event carries. */
function capsOf(trade: MissionTradeJson): { before: number; after: number } {
  const [virtualEth, virtualTokens, gross, amount] = [BigInt(trade.virtualEth), BigInt(trade.virtualTokens), BigInt(trade.eth), BigInt(trade.tokens)];
  const buy = trade.side === "buy";
  // A buy adds its ETH net of fees and takes tokens out; a sell does the reverse with its gross ETH.
  const before = buy ? capOf(virtualEth - (gross - BigInt(trade.fees)), virtualTokens + amount) : capOf(virtualEth + gross, virtualTokens - amount);
  return { before, after: capOf(virtualEth, virtualTokens) };
}

/**
 * Candles of market cap (in the coin) for one timeframe, from the trades
 * oldest first. Quiet stretches are filled flat, up to `now`, so the chart
 * reads as time passing rather than as trades in a row.
 */
export function candlesFrom(trades: readonly MissionTradeJson[], seconds: number, now: number): Candle[] {
  const candles: Candle[] = [];
  for (const trade of trades) {
    const time = Math.floor(trade.time / seconds) * seconds;
    const { before, after } = capsOf(trade);
    let last = candles[candles.length - 1];
    for (let gap = last ? last.time + seconds : time; last && gap < time; gap += seconds) {
      candles.push({ time: gap, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0 });
    }
    last = candles[candles.length - 1];
    if (!last || last.time !== time) candles.push((last = { time, open: last ? last.close : before, high: Math.max(before, after), low: Math.min(before, after), close: after, volume: 0 }));
    last.high = Math.max(last.high, before, after);
    last.low = Math.min(last.low, before, after);
    last.close = after;
    last.volume += eth(trade.eth);
  }
  const last = candles[candles.length - 1];
  for (let gap = last ? last.time + seconds : 0; last && gap <= now; gap += seconds) {
    candles.push({ time: gap, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0 });
    if (candles.length > MAX_CANDLES * 4) break;
  }
  return candles.slice(-MAX_CANDLES);
}

function lockOf(mission: MissionJson, network: TonkNetwork, now: number): DevLock | null {
  if (!mission.lock) return null;
  const { start, end, type, lockedBps } = mission.lock;
  const vestDays = Math.max(1, Math.round((end - start) / DAY_SECONDS));
  const elapsedDays = Math.min(vestDays, Math.max(0, Math.floor((now - start) / DAY_SECONDS)));
  return {
    share: lockedBps / 10_000,
    vestDays,
    unlocks: end * 1000,
    startedAt: start * 1000,
    elapsedDays,
    // A vest unlocks every second; a time-lock all at once at its end.
    nextUnlockDays: type === "linear" ? 0 : vestDays - elapsedDays,
    contract: shortAddress(network.launchpad),
    contractUrl: explorerAddressUrl(network, network.launchpad),
  };
}

/** The creator's buy inside the launch: the launch block's trade, else what the lock implies. */
function launchBuyOf(mission: MissionJson, trades: readonly MissionTradeJson[]): bigint {
  const own = trades.find((trade) => trade.block === mission.launchBlock && trade.side === "buy" && trade.trader.toLowerCase() === mission.creator.toLowerCase());
  if (own) return BigInt(own.tokens);
  return mission.lock && mission.lock.lockedBps > 0 ? (BigInt(mission.lock.total) * BigInt(10_000)) / BigInt(mission.lock.lockedBps) : BigInt(0);
}

/**
 * A mission as the token page shows it, in the chain's coin: every figure
 * here comes from the launchpad's state or its trades. What needs an
 * indexer (holders, top traders) stays empty rather than made up.
 */
export function missionDetail({ mission, trades }: MissionPageJson, network: TonkNetwork): TokenDetail {
  const now = Math.floor(mission.readAt / 1000);
  const oldestFirst = [...trades].reverse();
  const [virtualEth, virtualTokens] = [BigInt(mission.virtualEth), BigInt(mission.virtualTokens)];
  const cap = capOf(virtualEth, virtualTokens);
  const day = oldestFirst.filter((trade) => trade.time >= now - 24 * HOUR);
  const hour = day.filter((trade) => trade.time >= now - HOUR);
  // The cap a day ago: just before the day's first trade, which for a younger token is the cap it launched at.
  const dayAgo = day[0] ? capsOf(day[0]).before : cap;
  const lock = mission.lock ? missionLock(mission.lock) : null;
  const zero = BigInt(0);
  const score = missionScore({
    launchBuy: launchBuyOf(mission, trades),
    creatorHeld: BigInt(mission.creatorHeld),
    lockedNow: lock ? lockedAt(lock, now) : zero,
    lockedIn30Days: lock ? lockedAt(lock, now + 30 * DAY_SECONDS) : zero,
    crewBps: mission.crewBps,
    ageSeconds: now - mission.launchedAt,
  });
  const details = decodeMetadata(mission.metadata);
  const agent = decodeAgent(mission.agentPrompt);
  const candles = Object.fromEntries(CHART_TIMEFRAMES.map((tf) => [tf, candlesFrom(oldestFirst, TF_SECONDS[tf], now)])) as Record<ChartTimeframe, Candle[]>;
  const shown: TokenTrade[] = trades.map((trade) => ({
    id: trade.id,
    ageSeconds: Math.max(0, now - trade.time),
    side: trade.side,
    usd: null,
    native: eth(trade.eth),
    tokens: tokens(trade.tokens),
    marketCap: capsOf(trade).after,
    trader: trade.trader,
    tag: null,
    txUrl: explorerTxUrl(network, trade.tx),
  }));
  return {
    source: "live",
    token: {
      address: mission.token,
      ticker: mission.symbol,
      name: mission.name,
      chain: "rh",
      launchpad: "tonk",
      curve: mission.graduated ? 1 : curveFilled(BigInt(mission.tokensLeft)),
      score: score.score,
      level: score.level,
      spark: { seed: 1, drift: 0, vol: 0 },
      series: oldestFirst.map((trade) => capsOf(trade).after),
      change24h: dayAgo > 0 ? ((cap - dayAgo) / dayAgo) * 100 : 0,
      volume24h: day.reduce((sum, trade) => sum + eth(trade.eth), 0),
      holders: null,
      smartWallets: 0,
      marketCap: cap,
      flags: {
        hot: false,
        og: false,
        isNew: now - mission.launchedAt < 24 * HOUR,
        locked: lock ? isLockedMission(lockedAt(lock, now + 7 * DAY_SECONDS)) : false,
        crew: mission.crewBps >= 100 ? `${mission.crewBps / 100}%` : null,
        agent: agent !== null,
      },
      creator: shortAddress(mission.creator),
      ageMinutes: Math.max(0, (now - mission.launchedAt) / 60),
      art: "",
    },
    contract: mission.token,
    launchedAt: mission.launchedAt * 1000,
    priceUsd: tokenPrice(virtualEth, virtualTokens),
    supply: Number(TOTAL_SUPPLY / BigInt(10) ** BigInt(18)),
    description: details.description || null,
    links: { website: details.website || null, community: details.telegram || (details.x ? `https://x.com/${details.x.replace(/^@/, "")}` : null) },
    stats: { txns24h: day.length, liquidity: mission.graduated ? null : eth(mission.realEth), liquidityIn: mission.graduated ? "pool" : "curve", holdersChange1h: null, top10Share: null },
    chart: {
      volumeAvailable: true,
      candles,
      marks: Object.fromEntries(CHART_TIMEFRAMES.map((tf) => [tf, []])) as unknown as TokenDetail["chart"]["marks"],
      callout: null,
      graduationCap: null,
    },
    flow1h: { buys: hour.filter((trade) => trade.side === "buy").length, sells: hour.filter((trade) => trade.side === "sell").length },
    trades: shown,
    holders: [],
    topTraders: [],
    curve: mission.graduated ? null : shortAddress(network.launchpad),
    feePct: (100 + mission.crewBps + mission.creatorBps) / 100,
    devLock: lockOf(mission, network, now),
    crew: mission.crewBps >= 100 ? { paidUsd: eth(mission.crewPaid), sharePct: mission.crewBps / 100, lastPayoutSeconds: 0, daily: [] } : null,
    // The agent's brief is stored (the Agent mark says so), but no agent answers yet: nothing here is "live".
    agent: null,
    nativeUsd: null,
    updatedAt: mission.readAt,
  };
}
