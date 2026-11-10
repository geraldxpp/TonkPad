import { parseEventLogs, type Log, type PublicClient } from "viem";
import type { TonkNetwork } from "../networks";
import type { LockType } from "../rules";
import type { LaunchedMission, LaunchStatus } from "../types";
import { LAUNCHPAD_ABI } from "./abi";
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
      if (receipt.status !== "success") return { state: "failed", mission: null };
      const [launched] = parseEventLogs({ abi: LAUNCHPAD_ABI, eventName: "MissionLaunched", logs: receipt.logs });
      const locked = launched ? await lockedTokensOf(client, network, launched.args.token) : BigInt(0);
      return { state: "confirmed", mission: missionFromLogs(network, receipt.logs, Number(receipt.blockNumber), locked) };
    }
    const pending = await client.getTransaction({ hash }).catch(() => null);
    if (!pending) return { state: "unknown", mission: null };
    const used = await client.getTransactionCount({ address: pending.from, blockTag: "latest" });
    return { state: used > pending.nonce ? "replaced" : "pending", mission: null };
  } catch {
    throw new TonkError("unavailable", "transaction unreadable");
  }
}
