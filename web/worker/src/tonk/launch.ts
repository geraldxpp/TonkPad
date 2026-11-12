import { CURVE_SUPPLY } from "@/shared/tonk/curve";
import { decodeAgent } from "@/shared/tonk/metadata";
import { cleanName, cleanSymbol, newTrackedToken, NOT_ON_DEXSCREENER, type TrackedToken } from "../model";
import type { TonkEvent } from "./events";
import { curvePrice, type TonkState } from "./state";

/** What a window's reads add to a launch: its block's time, and the mission as stored at the window's last block. */
export interface LaunchFacts {
  /** Unix seconds. */
  time: number;
  agentPrompt: string;
  /** The curve's reserves at that block: its opening ones, unless it traded within the window. */
  virtualEth: bigint;
  virtualTokens: bigint;
}

/** An agent brief the app wrote: the Agent badge. Anything else stored there is just text, and earns nothing. */
export const hasAgent = (prompt: string) => decodeAgent(prompt) !== null;

export type TonkToken = TrackedToken & { tonk: TonkState };

/**
 * A launch as the store tracks it, from its MissionLaunched event. Its name
 * and ticker are untrusted (the contract only checks they aren't empty):
 * cleaned and bounded as every token's are, and only ever shown as text.
 */
export function launchedToken(e: Extract<TonkEvent, { kind: "launched" }>, facts: LaunchFacts): TonkToken {
  const token = newTrackedToken(
    {
      address: e.token,
      chain: "rh",
      launchpad: "tonk",
      name: cleanName(e.name),
      // An empty or invisible ticker shows as the address's first characters, as the token page does.
      symbol: cleanSymbol(e.symbol) || e.token.slice(2, 8).toUpperCase(),
      creator: e.creator,
      createdAt: facts.time * 1000,
      creatorBuyShare: 0,
      marketCapNative: null,
    },
    null,
  );
  const open = curvePrice(facts.virtualEth, facts.virtualTokens);
  const tonk: TonkState = {
    launchTx: e.tx,
    launchBlock: e.block,
    launchTime: facts.time,
    crewBps: e.crewBps,
    creatorBps: e.creatorBps,
    devBought: "0",
    lock: null,
    virtualEth: String(facts.virtualEth),
    virtualTokens: String(facts.virtualTokens),
    tokensLeft: String(CURVE_SUPPLY),
    realEth: "0",
    startPrice: open,
    spot: open,
    trades: [],
    pool: null,
    agent: hasAgent(facts.agentPrompt),
    balances: {},
  };
  return {
    ...token,
    tonk,
    // A fixed supply with no mint, pause or freeze: TonkToken has none of those functions.
    mintRevoked: true,
    freezeRevoked: true,
    supply: 1e27,
    decimals: 18,
    // Names come from the launch event, never Helius; art waits for hosting. Never priced by DexScreener either.
    assetAt: token.createdAt,
    nextRefreshAt: NOT_ON_DEXSCREENER,
  };
}
