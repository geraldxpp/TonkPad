import type { TonkState } from "./state";

/**
 * Each wallet's trades in a tonkfun.fun launch, curve and pool together,
 * since its launch: [ETH in, ETH out, tokens bought, tokens sold, sells,
 * sells that beat the wallet's average buy]. ETH in is what the wallet paid
 * (a launch-block buy's burned 99% included); ETH out what it received
 * after fees. Whole tokens and whole ETH.
 */
export type WalletFlow = [number, number, number, number, number, number];

/** Wallets kept per launch; past this the least active are dropped. */
export const MAX_WALLETS = 5_000;

export function recordFlow(s: TonkState, wallet: string, buy: boolean, eth: number, tokens: number): void {
  const flows = (s.flows ??= {});
  const flow = (flows[wallet] ??= [0, 0, 0, 0, 0, 0]);
  if (buy) {
    flow[0] += eth;
    flow[2] += tokens;
  } else {
    if (flow[2] > 0 && tokens > 0) {
      flow[4] += 1;
      if (eth / tokens > flow[0] / flow[2]) flow[5] += 1;
    }
    flow[1] += eth;
    flow[3] += tokens;
  }
  const wallets = Object.keys(flows);
  if (wallets.length <= MAX_WALLETS) return;
  const volume = (w: string) => flows[w][0] + flows[w][1];
  for (const w of wallets.sort((a, b) => volume(a) - volume(b)).slice(0, wallets.length - MAX_WALLETS)) delete flows[w];
}

export interface TonkTrader {
  wallet: string;
  /** ETH paid in and received out. */
  bought: number;
  sold: number;
  /** What its sells got, less what those tokens cost at its average buy (tokens it never bought cost nothing). */
  realised: number;
  /** Share of its sells that beat its average buy; null before it has sold. */
  winRate: number | null;
}

/** Realised profit: the sells' proceeds less the sold tokens' average cost. */
export function realisedOf([bought, sold, boughtTokens, soldTokens]: WalletFlow): number {
  if (boughtTokens <= 0) return sold;
  return sold - bought * Math.min(1, soldTokens / boughtTokens);
}

/** The wallets that traded the launch, the best realised profit first, then the most ETH in. */
export function tonkTraders(s: TonkState, limit = 20): TonkTrader[] {
  return Object.entries(s.flows ?? {})
    .map(([wallet, flow]) => ({ wallet, bought: flow[0], sold: flow[1], realised: realisedOf(flow), winRate: flow[4] > 0 ? flow[5] / flow[4] : null }))
    .sort((a, b) => b.realised - a.realised || b.bought - a.bought || (a.wallet < b.wallet ? -1 : 1))
    .slice(0, limit);
}
