import { parseEventLogs, type Log, type PublicClient } from "viem";
import type { TonkNetwork } from "../networks";
import type { LockType } from "../rules";
import type { TxEventJson } from "../mission";
import type { LaunchedMission, LaunchStatus } from "../types";
import { LAUNCHPAD_ABI, TOKEN_ABI } from "./abi";
import { TonkError, tonkClient } from "./client";

const LOCK_TYPES: readonly LockType[] = ["none", "time", "linear"];

/**
 * The mission a confirmed transaction launched, from its own logs: the
 * launchpad's MissionLaunched event, and the creator's buy inside the launch
 * (the CurveTrade for the same token). Null when the launchpad logged no
 * launch: any other transaction.
 */
export function missionFromLogs(network: TonkNetwork, logs: Log[], block: number, lockedTokens: bigint): LaunchedMission | null {
  const ours = logs.filter((log) => log.address.toLowerCase() === network.launchpad.toLowerCase());
  const [launched] = parseEventLogs({ abi: LAUNCHPAD_ABI, eventName: "MissionLaunched", logs: ours });
  if (!launched) return null;
  const { token, creator, name, symbol, crewFeeBps, creatorFeeBps, lockType, lockedBps, lockEnd, devBuyEth } = launched.args;
  const buy = parseEventLogs({ abi: LAUNCHPAD_ABI, eventName: "CurveTrade", logs: ours }).find((trade) => trade.args.isBuy && trade.args.token.toLowerCase() === token.toLowerCase());
  return {
    token,
    creator,
    name,
    symbol,
    crewBps: crewFeeBps,
    creatorBps: creatorFeeBps,
    lockType: LOCK_TYPES[lockType] ?? "none",
    lockedBps,
    lockEnd: Number(lockEnd),
    devBuy: String(devBuyEth),
    bought: String(buy?.args.tokenAmount ?? 0),
    locked: String(lockedTokens),
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
  return events;
}

/** The tokens a mission's dev lock holds, from the contract (0 without a lock). */
async function lockedTokensOf(client: PublicClient, network: TonkNetwork, token: `0x${string}`): Promise<bigint> {
  const lock = await client.readContract({ address: network.launchpad, abi: LAUNCHPAD_ABI, functionName: "devLocks", args: [token] });
  return lock[4];
}

/**
 * Where a launch transaction stands. A hash is never success on its own:
 * "confirmed" needs a successful receipt. A transaction the node knows but
 * whose nonce the account has already used was replaced or cancelled in the
 * wallet; one it doesn't know at all is "unknown" (it may still arrive).
 */
export async function launchStatus(network: TonkNetwork, hash: `0x${string}`): Promise<LaunchStatus> {
  const client = await tonkClient(network);
  try {
    const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) {
      if (receipt.status !== "success") return { state: "failed", mission: null, events: [] };
      const [launched] = parseEventLogs({ abi: LAUNCHPAD_ABI, eventName: "MissionLaunched", logs: receipt.logs });
      const locked = launched ? await lockedTokensOf(client, network, launched.args.token) : BigInt(0);
      return { state: "confirmed", mission: missionFromLogs(network, receipt.logs, Number(receipt.blockNumber), locked), events: txEvents(network, receipt.logs) };
    }
    const pending = await client.getTransaction({ hash }).catch(() => null);
    if (!pending) return { state: "unknown", mission: null, events: [] };
    const used = await client.getTransactionCount({ address: pending.from, blockTag: "latest" });
    return { state: used > pending.nonce ? "replaced" : "pending", mission: null, events: [] };
  } catch {
    throw new TonkError("unavailable", "transaction unreadable");
  }
}
