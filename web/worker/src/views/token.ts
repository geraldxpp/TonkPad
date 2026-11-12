import type { LiveStatus } from "@/shared/types/live";
import type { TokenDetail, TokenHolder } from "@/shared/types/token-detail";
import type { TrackedToken } from "../model";
import { PONS_SUPPLY } from "../pons/curve";
import { toToken } from "../tokens";
import type { SystemAddresses } from "../tonk/holders";
import type { TonkToken } from "../tonk/launch";
import { tonkHolders, tonkTraderRows } from "../tonk/view";
import { type ChartInputs, liveChart } from "./token-chart";
import { type ActivityContext, tradersView, tradesView } from "./token-activity";

/** Addresses are single path segments. Solana case matters; EVM case does not. */
export function validTokenAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/i.test(address) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export function findTrackedToken(tokens: readonly TrackedToken[], address: string): TrackedToken | undefined {
  const evm = /^0x/i.test(address);
  return tokens.find((token) => evm && token.chain === "rh"
    ? token.address.toLowerCase() === address.toLowerCase()
    : token.address === address);
}

/** Convert raw supply only when decimals are known; old snapshots stay unknown. */
function wholeSupply(token: TrackedToken): number | null {
  if (token.pons) return PONS_SUPPLY;
  const { supply, decimals } = token;
  if (!supply || decimals === undefined || decimals === null || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) return null;
  const whole = supply / 10 ** decimals;
  return Number.isFinite(whole) && whole > 0 ? whole : null;
}

const NO_ACTIVITY: ActivityContext = { book: null, isSmart: () => false };

/** Measured holder rows; curve balances stop being authoritative after graduation. */
function holders(token: TrackedToken, supply: number | null, isSmart: (wallet: string) => boolean): TokenHolder[] {
  if (token.pons && !token.graduated) {
    return Object.entries(token.pons.balances ?? {}).filter(([, amount]) => amount > 1)
      .sort((a, b) => b[1] - a[1]).slice(0, 50)
      .map(([address, amount]) => ({ address, tag: isSmart(address) ? "smart" : null, share: amount / PONS_SUPPLY, tokens: amount, crewEarned: null }));
  }
  const decimals = token.decimals;
  if (supply === null || decimals === undefined || decimals === null) return [];
  return (token.holderBalances ?? []).slice(0, 50).map(({ owner, amount }) => {
    const tokens = amount / 10 ** decimals;
    return { address: owner, tag: isSmart(owner) ? "smart" : null, share: tokens / supply, tokens, crewEarned: null };
  });
}

/** What a token page draws on besides the token's own record: its trade book, its chart's candles, and tonkfun.fun's system addresses. */
export interface TokenViewInputs {
  activity?: ActivityContext;
  charts?: ChartInputs;
  /** The launchpad, migrator and PoolManager, whose balances a tonkfun.fun launch's holders show labelled. */
  tonk?: SystemAddresses;
}

/** Same contract as the mock page, using only facts retained by the live worker. */
export function tokenView(token: TrackedToken, status: LiveStatus, now: number, inputs: TokenViewInputs = {}): TokenDetail {
  const activity = inputs.activity ?? NO_ACTIVITY;
  const market = token.marketAt > 0;
  const native = token.chain === "sol" ? status.solUsd : status.ethUsd;
  const nativeUsd = native !== null && Number.isFinite(native) && native > 0 ? native : null;
  const supply = wholeSupply(token);
  const liquidity = token.liquidityUsd;
  const staleCurveHolders = Boolean(token.pons && token.graduated && !token.holdersAt);
  // A tonkfun.fun launch's holders and traders come from its feed: exact, with its system addresses labelled.
  const launch = token.tonk && inputs.tonk ? { token: token as TonkToken, system: inputs.tonk } : null;
  return {
    source: "live",
    marketAvailable: market,
    token: toToken(token, now),
    contract: token.address,
    launchedAt: token.createdAt,
    priceUsd: market && token.priceUsd > 0 ? token.priceUsd : null,
    supply,
    description: null,
    links: { website: null, community: null },
    stats: {
      txns24h: market ? token.windows.h24.buys + token.windows.h24.sells : null,
      liquidity: liquidity !== undefined && liquidity !== null && nativeUsd !== null ? liquidity / nativeUsd : null,
      liquidityIn: token.graduated ? "pool" : "curve",
      holdersChange1h: null,
      top10Share: staleCurveHolders ? null : token.top10Share ?? null,
    },
    chart: liveChart(token, nativeUsd, inputs.charts),
    flow1h: market ? { buys: token.windows.h1.buys, sells: token.windows.h1.sells } : null,
    trades: tradesView(token, activity, nativeUsd, now),
    holders: launch ? tonkHolders(launch.token, launch.system, activity.isSmart) : holders(token, supply, activity.isSmart),
    topTraders: launch ? tonkTraderRows(launch.token, nativeUsd, activity.isSmart) : tradersView(token, activity, nativeUsd),
    curve: token.pons && !token.graduated ? token.pons.curve : null,
    feePct: null,
    devLock: null,
    crew: null,
    agent: null,
    nativeUsd,
    updatedAt: token.marketAt || token.createdAt,
  };
}
