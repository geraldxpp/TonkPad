import { type Abi, decodeEventLog } from "viem";
import { type Address, type Hex, lower, type RawLog, toNumber } from "../alerts/types";
import { FEED_EVENTS, MIGRATOR_FEED_EVENTS, POOL_EVENTS, TOKEN_EVENTS } from "./abi";

/** Where an event happened: its block, its place in that block, and its transaction. */
export interface Where {
  block: number;
  logIndex: number;
  tx: string;
}

export type FeedEvent =
  | { kind: "launched"; token: Address; creator: Address; name: string; symbol: string; crewBps: number; creatorBps: number; lockType: number }
  | { kind: "trade"; token: Address; trader: Address; isBuy: boolean; gross: bigint; tokens: bigint; fees: bigint; virtualEth: bigint; virtualTokens: bigint; left: bigint }
  | { kind: "bundleTax"; token: Address; sniper: Address; penalty: bigint }
  | { kind: "graduated"; token: Address }
  | { kind: "lockChanged"; token: Address }
  | { kind: "metadata"; token: Address; agentPrompt: string }
  | { kind: "poolLocked"; token: Address; fee: number; ethSeeded: bigint; tokensSeeded: bigint }
  | { kind: "swap"; pool: Hex; sender: Address; amount0: bigint; amount1: bigint; sqrtPriceX96: bigint }
  | { kind: "transfer"; token: Address; from: Address; to: Address; value: bigint };

export type TonkEvent = Where & FeedEvent;

/**
 * The longest text kept from an event. A token's name, ticker and stored
 * texts have no maximum on chain; past this they are cut here, before any
 * cleaning, and an agent brief this long isn't one the app wrote.
 */
export const TEXT_MAX = 4_096;
const bound = (text: string) => (text.length > TEXT_MAX ? text.slice(0, TEXT_MAX) : text);

interface Decoded {
  eventName: string;
  args: Record<string, unknown>;
}
const decode = (abi: Abi, log: RawLog): Decoded =>
  decodeEventLog({ abi, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]], strict: true }) as unknown as Decoded;

function launchpadEvent(log: RawLog): FeedEvent | null {
  const { eventName, args: a } = decode(FEED_EVENTS, log);
  const token = lower(String(a.token));
  switch (eventName) {
    case "MissionLaunched":
      return { kind: "launched", token, creator: lower(String(a.creator)), name: bound(String(a.name)), symbol: bound(String(a.symbol)), crewBps: Number(a.crewFeeBps), creatorBps: Number(a.creatorFeeBps), lockType: Number(a.lockType) };
    case "CurveTrade": {
      const fees = (a.protocolFee as bigint) + (a.crewFee as bigint) + (a.creatorFee as bigint);
      return { kind: "trade", token, trader: lower(String(a.trader)), isBuy: a.isBuy === true, gross: a.grossEth as bigint, tokens: a.tokenAmount as bigint, fees, virtualEth: a.newVirtualEth as bigint, virtualTokens: a.newVirtualTokens as bigint, left: a.remainingCurveTokens as bigint };
    }
    case "BundleTaxCollected":
      return { kind: "bundleTax", token, sniper: lower(String(a.sniper)), penalty: a.penaltyEth as bigint };
    case "MissionGraduated":
      return { kind: "graduated", token };
    case "LockExtended":
    case "DevTokensClaimed":
      return { kind: "lockChanged", token };
    case "MetadataUpdated": {
      const prompt = String(a.newAgentPrompt);
      return { kind: "metadata", token, agentPrompt: prompt.length > TEXT_MAX ? "" : prompt };
    }
    default:
      return null;
  }
}

function migratorEvent(log: RawLog): FeedEvent | null {
  const { eventName, args: a } = decode(MIGRATOR_FEED_EVENTS, log);
  if (eventName !== "PoolGraduatedAndLocked") return null;
  return { kind: "poolLocked", token: lower(String(a.token)), fee: Number(a.poolFee), ethSeeded: a.ethSeeded as bigint, tokensSeeded: a.tokensSeeded as bigint };
}

function swapEvent(log: RawLog): FeedEvent {
  const a = decode(POOL_EVENTS, log).args;
  return { kind: "swap", pool: lower(String(a.id)), sender: lower(String(a.sender)), amount0: a.amount0 as bigint, amount1: a.amount1 as bigint, sqrtPriceX96: a.sqrtPriceX96 as bigint };
}

function transferEvent(log: RawLog): FeedEvent | null {
  // An ERC-20 Transfer has three topics; anything else from the address isn't one.
  if (log.topics.length !== 3) return null;
  const a = decode(TOKEN_EVENTS, log).args;
  return { kind: "transfer", token: lower(log.address), from: lower(String(a.from)), to: lower(String(a.to)), value: a.value as bigint };
}

/** Decodes without throwing: an event the feed doesn't read is null. */
function attempt(decodeOne: () => FeedEvent | null): FeedEvent | null {
  try {
    return decodeOne();
  } catch {
    return null;
  }
}

/** Who may say what: each kind of event counts only from the contract that emits it. */
export interface Sources {
  launchpad: Address;
  migrator: Address;
  poolManager: Address;
  /** A token this launchpad launched. */
  isToken: (address: Address) => boolean;
  /** The id of a graduated launch's own pool. */
  isPool: (id: Hex) => boolean;
}

/**
 * Logs as the feed's events, in chain order. A launchpad or migrator event
 * counts only from that contract, a Swap only from Uniswap's PoolManager on a
 * launch's own pool, and a Transfer only from a token the launchpad launched,
 * so a look-alike from anywhere else is ignored.
 */
export function decodeFeedLogs(raw: readonly RawLog[], sources: Sources): TonkEvent[] {
  const events: TonkEvent[] = [];
  for (const log of raw) {
    if ((log as { removed?: boolean }).removed === true) continue;
    const from = lower(log.address);
    let event: FeedEvent | null = null;
    if (from === sources.launchpad) event = attempt(() => launchpadEvent(log));
    else if (from === sources.migrator) event = attempt(() => migratorEvent(log));
    else if (from === sources.poolManager) event = attempt(() => swapEvent(log));
    else if (sources.isToken(from)) event = attempt(() => transferEvent(log));
    if (!event || (event.kind === "swap" && !sources.isPool(event.pool))) continue;
    events.push({ ...event, block: toNumber(log.blockNumber), logIndex: toNumber(log.logIndex), tx: lower(log.transactionHash) });
  }
  return events.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
}
