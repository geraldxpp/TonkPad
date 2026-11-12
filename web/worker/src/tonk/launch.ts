import { CURVE_SUPPLY } from "@/shared/tonk/curve";
import { hiddenImages } from "@/shared/tonk/image";
import { decodeAgent, decodeMetadata } from "@/shared/tonk/metadata";
import { cleanName, cleanSymbol, newTrackedToken, NOT_ON_DEXSCREENER, type TrackedToken } from "../model";
import type { TonkEvent } from "./events";
import { curvePrice, type TonkState } from "./state";

/** What a window's reads add to a launch: its block's time, and the mission as stored at the window's last block. */
export interface LaunchFacts {
  /** Unix seconds. */
  time: number;
  metadataUri: string;
  agentPrompt: string;
  /** The curve's reserves at that block: its opening ones, unless it traded within the window. */
  virtualEth: bigint;
  virtualTokens: bigint;
}

/** An agent brief the app wrote: the Agent badge. Anything else stored there is just text, and earns nothing. */
export const hasAgent = (prompt: string) => decodeAgent(prompt) !== null;

/**
 * A launch's art: the image in its metadata, only if it is on tonkfun.fun's
 * own image host and not on the owner's hide list; otherwise none, and
 * Explore shows the token's letter. Any other address in it is ignored.
 */
export const tonkArt = (metadataUri: string): string | null => decodeMetadata(metadataUri, hiddenImages()).image || null;

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
    // Names and art come from the launchpad, never Helius. Never priced by DexScreener either.
    image: tonkArt(facts.metadataUri),
    assetAt: token.createdAt,
    nextRefreshAt: NOT_ON_DEXSCREENER,
  };
}
