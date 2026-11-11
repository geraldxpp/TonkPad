import type { PublicClient } from "viem";
import { cached } from "@/shared/swap/server/cache";
import { shortAddress } from "@/shared/lib/address";
import { chainText } from "../metadata";
import type { MissionJson, MissionPageJson, MissionSummaryJson, MissionTradeJson } from "../mission";
import type { TonkNetwork } from "../networks";
import { ARBSYS, ARBSYS_ABI, LAUNCHPAD_ABI, TOKEN_ABI } from "./abi";
import { TonkError, tonkClient } from "./client";
import { poolIdAt } from "./pool";

const LOCK_TYPES = ["none", "time", "linear"] as const;
/** The newest trades the page reads; older history waits for the indexer. */
export const MAX_TRADES = 500;
export const LATEST_MISSIONS = 20;
/** When the RPC refuses a whole history in one query, it is asked in ranges of this many blocks, newest first. */
const LOG_RANGE = BigInt(2_000_000);

/**
 * The contract checks only that a name and ticker aren't empty, and sets no
 * maximum on the two texts it stores. Anyone can call it directly, so what
 * it holds is bounded here: a name and ticker are shown at most this long,
 * and a stored text longer than anything the app writes is not passed on.
 */
const NAME_MAX = 64;
const TICKER_MAX = 16;
const STORED_MAX = 4_096;
const stored = (text: string) => (text.length > STORED_MAX ? "" : text);
const nameOf = (name: string, token: string) => chainText(name, NAME_MAX) || shortAddress(token);
const tickerOf = (symbol: string, token: string) => chainText(symbol, TICKER_MAX) || token.slice(2, 8).toUpperCase();

type Address = `0x${string}`;
const unavailable = (what: string) => new TonkError("unavailable", what);

/**
 * A mission's state at one block: the launchpad's record of it, its lock,
 * and its token's Crew figures. `blockNumber` pins every read to one block,
 * so a trade simulated at that block sees exactly this state.
 */
export async function readMissionAt(client: PublicClient, network: TonkNetwork, token: Address, blockNumber?: bigint): Promise<MissionJson> {
  const at = blockNumber === undefined ? {} : { blockNumber };
  const pad = { address: network.launchpad, abi: LAUNCHPAD_ABI, ...at } as const;
  const coin = { address: token, abi: TOKEN_ABI, ...at } as const;
  const mission = await client.readContract({ ...pad, functionName: "missions", args: [token] }).catch(() => {
    throw unavailable("mission unreadable");
  });
  const [address, creator, launchedAt, launchBlock, crewBps, creatorBps, graduated, virtualEth, virtualTokens, realEth, tokensLeft, , metadata, agentPrompt] = mission;
  if (address.toLowerCase() !== token.toLowerCase()) throw new TonkError("missing", "not a mission of this launchpad", 404);
  try {
    const [lock, checkpoint, paused, name, symbol, eligibleSupply, crewPaid, creatorHeld, block] = await Promise.all([
      client.readContract({ ...pad, functionName: "devLocks", args: [token] }),
      client.readContract({ ...pad, functionName: "devVestedCheckpoint", args: [token] }),
      client.readContract({ ...pad, functionName: "paused" }),
      client.readContract({ ...coin, functionName: "name" }),
      client.readContract({ ...coin, functionName: "symbol" }),
      client.readContract({ ...coin, functionName: "eligibleSupply" }),
      client.readContract({ ...coin, functionName: "totalCrewRewardsPaid" }),
      client.readContract({ ...coin, functionName: "balanceOf", args: [creator] }),
      // The L2 block as the contract's own shield reads it.
      client.readContract({ address: ARBSYS, abi: ARBSYS_ABI, functionName: "arbBlockNumber", ...at }),
    ]);
    const [lockType, lockedBps, lockStart, lockEnd, totalLocked, claimed] = lock;
    const type = LOCK_TYPES[lockType] ?? "none";
    // A graduated token trades on its pool where this network has a router; its id is how a pool trade's receipt is recognised.
    const pool = graduated && network.uniswap ? await poolIdAt(client, network, token, crewBps + creatorBps, blockNumber) : null;
    return {
      chainId: network.chainId,
      token: address,
      name: nameOf(name, address),
      symbol: tickerOf(symbol, address),
      creator,
      launchedAt: Number(launchedAt),
      launchBlock: Number(launchBlock),
      crewBps,
      creatorBps,
      graduated,
      paused: paused === true,
      virtualEth: String(virtualEth),
      virtualTokens: String(virtualTokens),
      realEth: String(realEth),
      tokensLeft: String(tokensLeft),
      eligibleSupply: String(eligibleSupply),
      crewPaid: String(crewPaid),
      metadata: stored(metadata),
      agentPrompt: stored(agentPrompt),
      lock: type === "none" || totalLocked === BigInt(0) ? null : { type, lockedBps, start: Number(lockStart), end: Number(lockEnd), total: String(totalLocked), claimed: String(claimed), checkpoint: String(checkpoint) },
      creatorHeld: String(creatorHeld),
      block: Number(block),
      pool,
      buyingOpen: block > launchBlock + BigInt(1),
      readAt: Date.now(),
    };
  } catch {
    throw unavailable("mission unreadable");
  }
}

/** A mission's latest state. Identical reads within `maxAgeMs` share one round trip. */
export function readMission(network: TonkNetwork, token: string, maxAgeMs = 2_000): Promise<MissionJson> {
  return cached(`tonk:mission:${network.chainId}:${token.toLowerCase()}`, maxAgeMs, async () => readMissionAt(await tonkClient(network), network, token as Address));
}

const blockTime = new Map<string, number>();
const MAX_BLOCK_TIMES = 20_000;

/** When each block was made, in unix seconds. Logs here carry no timestamp; a block's never changes, so each is asked once. */
async function blockTimes(client: PublicClient, chainId: number, blocks: readonly bigint[]): Promise<(block: bigint) => number> {
  const missing = [...new Set(blocks)].filter((block) => !blockTime.has(`${chainId}:${block}`));
  const found = await Promise.all(missing.map((blockNumber) => client.getBlock({ blockNumber })));
  if (blockTime.size + found.length > MAX_BLOCK_TIMES) blockTime.clear();
  for (const block of found) blockTime.set(`${chainId}:${block.number}`, Number(block.timestamp));
  return (block) => blockTime.get(`${chainId}:${block}`) ?? 0;
}

/**
 * Events of one kind from `fromBlock` to now, oldest first. One query when
 * the RPC allows it; otherwise bounded ranges from the newest back, stopping
 * once `enough` events are in hand.
 */
async function eventsSince<T extends { blockNumber: bigint }>(query: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>, fromBlock: bigint, latest: bigint, enough: number): Promise<T[]> {
  try {
    return await query(fromBlock, latest);
  } catch {
    const events: T[] = [];
    for (let to = latest; to >= fromBlock && events.length < enough; to -= LOG_RANGE) {
      const from = to - LOG_RANGE + BigInt(1) > fromBlock ? to - LOG_RANGE + BigInt(1) : fromBlock;
      events.unshift(...(await query(from, to)));
    }
    return events;
  }
}

/** A mission's curve trades from its CurveTrade events, newest first. */
export function readTrades(network: TonkNetwork, token: string, launchBlock: number): Promise<MissionTradeJson[]> {
  return cached(`tonk:trades:${network.chainId}:${token.toLowerCase()}`, 3_000, async () => {
    const client = await tonkClient(network);
    try {
      const latest = await client.getBlockNumber();
      const query = (fromBlock: bigint, toBlock: bigint) =>
        client.getContractEvents({ address: network.launchpad, abi: LAUNCHPAD_ABI, eventName: "CurveTrade", args: { token: token as Address }, fromBlock, toBlock, strict: true });
      const logs = (await eventsSince(query, BigInt(launchBlock), latest, MAX_TRADES)).slice(-MAX_TRADES);
      const timeOf = await blockTimes(client, network.chainId, logs.map((log) => log.blockNumber));
      return logs.reverse().map((log) => ({
        id: `${log.transactionHash}:${log.logIndex}`,
        tx: log.transactionHash,
        side: log.args.isBuy ? ("buy" as const) : ("sell" as const),
        trader: log.args.trader,
        eth: String(log.args.grossEth),
        tokens: String(log.args.tokenAmount),
        fees: String(log.args.protocolFee + log.args.crewFee + log.args.creatorFee),
        virtualEth: String(log.args.newVirtualEth),
        virtualTokens: String(log.args.newVirtualTokens),
        block: Number(log.blockNumber),
        time: timeOf(log.blockNumber),
      }));
    } catch {
      throw unavailable("trades unreadable");
    }
  });
}

/** What the token page reads: the mission and its newest trades. */
export async function readMissionPage(network: TonkNetwork, token: string): Promise<MissionPageJson> {
  const mission = await readMission(network, token);
  return { mission, trades: await readTrades(network, token, mission.launchBlock) };
}

/** The launchpad's latest launches from its MissionLaunched events, newest first. */
export function readLatestMissions(network: TonkNetwork): Promise<MissionSummaryJson[]> {
  return cached(`tonk:missions:${network.chainId}`, 15_000, async () => {
    const client = await tonkClient(network);
    try {
      const latest = await client.getBlockNumber();
      const query = (fromBlock: bigint, toBlock: bigint) => client.getContractEvents({ address: network.launchpad, abi: LAUNCHPAD_ABI, eventName: "MissionLaunched", fromBlock, toBlock, strict: true });
      const logs = (await eventsSince(query, BigInt(network.launchpadBlock), latest, LATEST_MISSIONS)).slice(-LATEST_MISSIONS);
      const timeOf = await blockTimes(client, network.chainId, logs.map((log) => log.blockNumber));
      return logs.reverse().map((log) => ({ token: log.args.token, name: nameOf(log.args.name, log.args.token), symbol: tickerOf(log.args.symbol, log.args.token), creator: log.args.creator, block: Number(log.blockNumber), time: timeOf(log.blockNumber) }));
    } catch {
      throw unavailable("launches unreadable");
    }
  });
}
