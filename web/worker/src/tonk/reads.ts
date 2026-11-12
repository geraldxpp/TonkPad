import { encodeAbiParameters, keccak256 } from "viem";
import { type Read, view } from "../alerts/reads";
import { resultOf, RpcFailure } from "../alerts/rpc";
import { type Address, type Hex, hexOf, lower, type RawLog, ZERO_ADDRESS } from "../alerts/types";
import { FEED_VIEWS } from "./abi";
import { TEXT_MAX } from "./events";

/** eth_getLogs from one address or several, with topics when given. */
export const logsWhere = (from: number, to: number, address: Address | readonly Address[], topics?: ReadonlyArray<Hex | readonly Hex[] | null>): Read<RawLog[]> => ({
  call: { method: "eth_getLogs", params: [{ fromBlock: hexOf(from), toBlock: hexOf(to), address, ...(topics ? { topics } : {}) }] },
  parse: (reply) => {
    const result = resultOf(reply, "eth_getLogs");
    if (!Array.isArray(result)) throw new RpcFailure("eth_getLogs: not a list");
    return result as RawLog[];
  },
});

/** A mission as the launchpad stores it: its curve's virtual reserves, and its agent brief (untrusted text, only ever read as the app's own JSON). */
export interface MissionRecord {
  virtualEth: bigint;
  virtualTokens: bigint;
  agentPrompt: string;
}

export const missionOf = (launchpad: Address, token: Address, block: number): Read<MissionRecord | null> =>
  view(launchpad, FEED_VIEWS, "missions", [token], block, (value) => {
    const row = value as readonly unknown[];
    const prompt = String(row[13] ?? "");
    return { virtualEth: row[7] as bigint, virtualTokens: row[8] as bigint, agentPrompt: prompt.length > TEXT_MAX ? "" : prompt };
  });

/** devLocks(token): lockType, lockedBpsOfDevBuy, lockStart, lockEnd, totalLocked, claimedAmount. */
export type DevLockRow = readonly [number, number, bigint, bigint, bigint, bigint];
export const devLockOf = (launchpad: Address, token: Address, block: number): Read<DevLockRow | null> =>
  view(launchpad, FEED_VIEWS, "devLocks", [token], block, (value) => value as DevLockRow);
export const checkpointOf = (launchpad: Address, token: Address, block: number): Read<bigint | null> =>
  view(launchpad, FEED_VIEWS, "devVestedCheckpoint", [token], block, (value) => value as bigint);

/** An address a contract names: the migrator's PoolManager and guard, the guard's migrator and PoolManager. */
export const named = (contract: Address, functionName: "poolManager" | "initializationGuard" | "migrator", block: number): Read<Address | null> =>
  view(contract, FEED_VIEWS, functionName, [], block, (value) => lower(String(value)));

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export const poolKeyOf = (migrator: Address, token: Address, fee: number, block: number): Read<PoolKey | null> =>
  view(migrator, FEED_VIEWS, "poolKey", [token, fee], block, (value) => {
    const key = value as { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string };
    return { currency0: lower(key.currency0), currency1: lower(key.currency1), fee: Number(key.fee), tickSpacing: Number(key.tickSpacing), hooks: lower(key.hooks) };
  });

/** The migrator's tick spacing for every pool it seeds. */
const TICK_SPACING = 60;
/** A v4 hook's permissions are its address's lowest 14 bits: the guard has beforeInitialize (bit 13) and nothing else. */
const HOOK_FLAGS = (BigInt(1) << BigInt(14)) - BigInt(1);
const BEFORE_INITIALIZE = BigInt(1) << BigInt(13);

export const isGuardShaped = (guard: Address) => (BigInt(guard) & HOOK_FLAGS) === BEFORE_INITIALIZE;

const KEY_TYPES = [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }] as const;

/** A pool's id: the hash of its key, as v4 computes it. */
export const poolIdOf = (key: PoolKey): Hex => keccak256(encodeAbiParameters(KEY_TYPES, [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));

/**
 * The id of the pool the migrator seeded for `token`, from its own key, or
 * null unless that key is exactly the guarded one: ETH against the token, at
 * the fee the migrator recorded, spacing 60, the guard as its one hook. A
 * look-alike pool for the same token (another hook, fee or spacing) never
 * has this id, so its swaps are never read.
 */
export function guardedPoolId(key: PoolKey | null, token: Address, fee: number, guard: Address): Hex | null {
  if (!key) return null;
  const ours = key.currency0 === ZERO_ADDRESS && key.currency1 === token && key.fee === fee && key.tickSpacing === TICK_SPACING && key.hooks === guard;
  return ours ? lower(poolIdOf(key)) : null;
}
