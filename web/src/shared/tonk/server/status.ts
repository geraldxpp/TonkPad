import { parseEventLogs, TransactionNotFoundError, TransactionReceiptNotFoundError, type Log, type PublicClient, type TransactionReceipt } from "viem";
import type { TonkNetwork } from "../networks";
import type { LockType } from "../rules";
import type { TxEventJson } from "../mission";
import { isTxHash, type LaunchedMission, type LaunchStatus, type TxCall, type TxSender } from "../types";
import { LAUNCHPAD_ABI, TOKEN_ABI } from "./abi";
import { TonkError, tonkClient } from "./client";
import { POOL_MANAGER_ABI } from "./pool";
import { MIGRATOR_ABI } from "./pool-key";

const LOCK_TYPES: readonly LockType[] = ["none", "time", "linear"];
const BPS = BigInt(10_000);
const EXPLORER_TIMEOUT_MS = 6_000;

/**
 * The mission a confirmed transaction launched, from its own logs: the
 * launchpad's MissionLaunched event, and the creator's buy inside the launch
 * (the CurveTrade for the same token). The lock holds `lockedBps` of that
 * buy, as the contract works it out. Null when the launchpad logged no
 * launch: any other transaction.
 */
export function missionFromLogs(network: TonkNetwork, logs: Log[], block: number): LaunchedMission | null {
  const ours = logs.filter((log) => log.address.toLowerCase() === network.launchpad.toLowerCase());
  const [launched] = parseEventLogs({ abi: LAUNCHPAD_ABI, eventName: "MissionLaunched", logs: ours });
  if (!launched) return null;
  const { token, creator, name, symbol, crewFeeBps, creatorFeeBps, lockType, lockedBps, lockEnd, devBuyEth } = launched.args;
  const buy = parseEventLogs({ abi: LAUNCHPAD_ABI, eventName: "CurveTrade", logs: ours }).find((trade) => trade.args.isBuy && trade.args.token.toLowerCase() === token.toLowerCase());
  const bought = buy?.args.tokenAmount ?? BigInt(0);
  const type = LOCK_TYPES[lockType] ?? "none";
  return {
    token,
    creator,
    name,
    symbol,
    crewBps: crewFeeBps,
    creatorBps: creatorFeeBps,
    lockType: type,
    // With no lock the event still carries whatever share was asked for; the receipt shows none (review finding L-3).
    lockedBps: type === "none" ? 0 : lockedBps,
    lockEnd: type === "none" ? 0 : Number(lockEnd),
    devBuy: String(devBuyEth),
    bought: String(bought),
    locked: String(type === "none" ? BigInt(0) : (bought * BigInt(lockedBps)) / BPS),
    protocolFee: String(buy?.args.protocolFee ?? 0),
    creatorFee: String(buy?.args.creatorFee ?? 0),
    block,
  };
}

/**
 * What a confirmed transaction did, from its own events: the launchpad's for
 * trades and the creator's tools, and a token's for approvals and reward
 * payments (each names the contract that logged it, for the page to match).
 */
export function txEvents(network: TonkNetwork, logs: Log[]): TxEventJson[] {
  const isPad = (log: Log) => log.address.toLowerCase() === network.launchpad.toLowerCase();
  const events: TxEventJson[] = [];
  for (const log of parseEventLogs({ abi: LAUNCHPAD_ABI, logs: logs.filter(isPad) })) {
    if (log.eventName === "CurveTrade") {
      const { token, trader, isBuy, grossEth, tokenAmount, protocolFee, crewFee, creatorFee } = log.args;
      events.push({ kind: "trade", token, trader, side: isBuy ? "buy" : "sell", eth: String(grossEth), tokens: String(tokenAmount), protocolFee: String(protocolFee), crewFee: String(crewFee), creatorFee: String(creatorFee) });
    } else if (log.eventName === "MissionGraduated") events.push({ kind: "graduated", token: log.args.token });
    else if (log.eventName === "DevTokensClaimed") events.push({ kind: "claimed", token: log.args.token, amount: String(log.args.amount) });
    else if (log.eventName === "LockExtended") events.push({ kind: "extended", token: log.args.token, lockEnd: Number(log.args.newLockEnd) });
    else if (log.eventName === "MetadataUpdated") events.push({ kind: "edited", token: log.args.token });
    else if (log.eventName === "FallbackEthWithdrawn") events.push({ kind: "withdrawn", recipient: log.args.recipient, amount: String(log.args.amount) });
  }
  for (const log of parseEventLogs({ abi: TOKEN_ABI, logs: logs.filter((entry) => !isPad(entry)) })) {
    if (log.eventName === "CrewRewardPaid") events.push({ kind: "rewards", token: log.address, holder: log.args.holder, amount: String(log.args.ethAmount) });
    else if (log.args.spender.toLowerCase() === network.launchpad.toLowerCase()) events.push({ kind: "approved", token: log.address, owner: log.args.owner, amount: String(log.args.value) });
  }
  // Pool fees shared, only by this network's own migrator.
  const migrator = network.migrator.toLowerCase();
  for (const log of parseEventLogs({ abi: MIGRATOR_ABI, eventName: "PostGradRewardsDistributed", logs: logs.filter((entry) => entry.address.toLowerCase() === migrator) })) {
    const { token, protocolEth, crewEth, creatorEth, tokensBurned } = log.args;
    events.push({ kind: "shared", token, protocolEth: String(protocolEth), crewEth: String(crewEth), creatorEth: String(creatorEth), tokensBurned: String(tokensBurned) });
  }
  // Swaps on graduated pools, only from Uniswap's own PoolManager: the swapper's deltas, so a buy pays ETH in (negative) and takes tokens out.
  const manager = network.uniswap?.poolManager.toLowerCase();
  if (manager) {
    for (const log of parseEventLogs({ abi: POOL_MANAGER_ABI, eventName: "Swap", logs: logs.filter((entry) => entry.address.toLowerCase() === manager) })) {
      const { id, amount0, amount1 } = log.args;
      const buy = amount0 < BigInt(0);
      events.push({ kind: "pool", pool: id, side: buy ? "buy" : "sell", eth: String(buy ? -amount0 : amount0), tokens: String(buy ? amount1 : -amount1) });
    }
  }
  return events;
}

/** Finds the transaction that spent a sender's nonce; null when that can't be told. */
export type NonceLookup = (from: `0x${string}`, nonce: number) => Promise<`0x${string}` | null>;

/** The chain's explorer (Blockscout) lists a sender's transactions with their nonces. */
export function explorerNonceLookup(network: TonkNetwork): NonceLookup {
  return async (from, nonce) => {
    try {
      const res = await fetch(`${network.explorerUrl}/api/v2/addresses/${from}/transactions?filter=from`, { signal: AbortSignal.timeout(EXPLORER_TIMEOUT_MS), cache: "no-store" });
      if (!res.ok) return null;
      const body: unknown = await res.json();
      const items = typeof body === "object" && body !== null && Array.isArray((body as { items?: unknown }).items) ? (body as { items: unknown[] }).items : [];
      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const { nonce: at, hash } = item as { nonce?: unknown; hash?: unknown };
        if (at === nonce && typeof hash === "string" && isTxHash(hash)) return hash as `0x${string}`;
      }
      return null;
    } catch {
      return null;
    }
  };
}

/** A read that tells "not there (yet)" apart from "couldn't ask": only the first is an answer. */
async function found<T>(work: Promise<T>, notFound: (error: unknown) => boolean): Promise<T | null> {
  try {
    return await work;
  } catch (error) {
    if (notFound(error)) return null;
    throw new TonkError("unavailable", "transaction unreadable");
  }
}
const receiptOf = (client: PublicClient, hash: `0x${string}`) => found(client.getTransactionReceipt({ hash }), (error) => error instanceof TransactionReceiptNotFoundError);
const transactionOf = (client: PublicClient, hash: `0x${string}`) => found(client.getTransaction({ hash }), (error) => error instanceof TransactionNotFoundError);

/** What a receipt says: confirmed with what it did, or failed. */
function settledBy(network: TonkNetwork, receipt: TransactionReceipt, sender: TxSender | null, replacedBy: `0x${string}` | null = null): LaunchStatus {
  const block = Number(receipt.blockNumber);
  if (receipt.status !== "success") return { state: "failed", mission: null, events: [], block, sender, replacedBy };
  return { state: "confirmed", mission: missionFromLogs(network, receipt.logs, block), events: txEvents(network, receipt.logs), block, sender, replacedBy };
}

const open = (state: "pending" | "unknown", sender: TxSender | null, replacedBy: `0x${string}` | null = null): LaunchStatus => ({ state, mission: null, events: [], block: null, sender, replacedBy });

/**
 * Where a transaction stands. Only its own receipt settles it; read errors
 * are thrown, never taken for an answer. One whose nonce something else has
 * spent counts as replaced only once that other transaction is found at the
 * same nonce, and its receipt is reported in its place (`replacedBy`) for the
 * page to judge: a sped-up copy did the same thing, a cancellation didn't.
 * Short of that it stays pending or unknown, and the page keeps checking.
 * `hint` is the sender and nonce from an earlier answer, for a transaction
 * the node has since dropped.
 */
export async function txStatus(client: PublicClient, network: TonkNetwork, hash: `0x${string}`, hint: TxSender | null, lookup: NonceLookup): Promise<LaunchStatus> {
  const receipt = await receiptOf(client, hash);
  if (receipt) return settledBy(network, receipt, hint);
  const tx = await transactionOf(client, hash);
  const sender: TxSender | null = tx ? { from: tx.from, nonce: tx.nonce } : hint;
  // Mined, with its receipt not yet readable (a lagging replica): ask again.
  if (tx?.blockNumber != null) return open("pending", sender);
  if (!sender) return open("unknown", null);
  const used = await client.getTransactionCount({ address: sender.from, blockTag: "latest" }).catch(() => {
    throw new TonkError("unavailable", "nonce unreadable");
  });
  if (used <= sender.nonce) return open(tx ? "pending" : "unknown", sender);
  // The nonce is spent; perhaps by this very transaction, read a moment late.
  const late = await receiptOf(client, hash);
  if (late) return settledBy(network, late, sender);
  const other = await lookup(sender.from, sender.nonce);
  if (!other || other.toLowerCase() === hash.toLowerCase()) return open("unknown", sender);
  // What the replacement called, for the page to tell a sped-up copy from anything else; unreadable is left out.
  const call = await transactionOf(client, other).catch(() => null);
  const replacedCall: TxCall | null = call ? { to: call.to ?? null, data: call.input, value: String(call.value) } : null;
  const replacement = await receiptOf(client, other);
  return { ...(replacement ? settledBy(network, replacement, sender, other) : open("pending", sender, other)), replacedCall };
}

/** GET /api/tonk/tx: a transaction's status on the network's chain. */
export async function launchStatus(network: TonkNetwork, hash: `0x${string}`, hint: TxSender | null = null): Promise<LaunchStatus> {
  return txStatus(await tonkClient(network), network, hash, hint, explorerNonceLookup(network));
}
