import { encodeAbiParameters, keccak256, parseAbi, type PublicClient } from "viem";
import type { TonkNetwork, UniswapContracts } from "../networks";
import { type Address, ZERO_ADDRESS } from "./build";
import { TonkError } from "./client";

/**
 * A graduated token trades only on the pool its migrator seeded: ETH against
 * the token, at the fee the migrator recorded, tick spacing 60, with the
 * migrator's own initialization guard as its one hook. The guard lets nobody
 * but the migrator initialize a pool with that key, so a look-alike pool
 * someone creates for the same token (another hook, fee or spacing) is never
 * the one quoted, traded or matched to a receipt.
 */

export const POOL_KEY = "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }";

/** The migrator's own record of each graduated token's pool, from the repaired build. */
export const MIGRATOR_ABI = parseAbi([
  POOL_KEY,
  "function poolKey(address token, uint24 fee) view returns (PoolKey)",
  "function lockedPositions(address token) view returns (address token, address creator, uint256 positionTokenId, uint16 crewFeeBps, uint16 creatorFeeBps, uint24 uniV4PoolFee, uint256 totalEthFeesCollected, uint256 totalTokensBurned, bool initialized)",
  "function initializationGuard() view returns (address)",
]);
/** The guard names the one migrator it lets initialize pools, on the one PoolManager it answers to. */
export const GUARD_ABI = parseAbi(["function migrator() view returns (address)", "function poolManager() view returns (address)"]);

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

/** The migrator's tick spacing for every pool it seeds. */
const TICK_SPACING = 60;
/** A v4 hook's permissions are its address's lowest 14 bits: the guard has beforeInitialize (bit 13) and nothing else. */
const HOOK_FLAGS = (BigInt(1) << BigInt(14)) - BigInt(1);
const BEFORE_INITIALIZE = BigInt(1) << BigInt(13);

const KEY_TYPES = [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }] as const;

/** A pool's id: the hash of its key, as v4 computes it. */
export const poolIdOf = (key: PoolKey) => keccak256(encodeAbiParameters(KEY_TYPES, [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));

const unreadable = (): never => {
  throw new TonkError("unavailable", "pool unreadable");
};

/** Both sides are immutable, so the guard is checked once per client and migrator. */
const guards = new WeakMap<PublicClient, Map<string, Promise<string>>>();

/** The migrator's guard, once it is shown to be a beforeInitialize-only hook serving this migrator on Uniswap's own PoolManager. */
export function poolGuard(client: PublicClient, network: TonkNetwork, uniswap: UniswapContracts): Promise<string> {
  const known = guards.get(client) ?? new Map<string, Promise<string>>();
  guards.set(client, known);
  const cached = known.get(network.migrator);
  if (cached) return cached;
  const checking = (async () => {
    const guard = await client.readContract({ address: network.migrator, abi: MIGRATOR_ABI, functionName: "initializationGuard" }).catch(unreadable);
    if ((BigInt(guard) & HOOK_FLAGS) !== BEFORE_INITIALIZE) throw new TonkError("refused", "the pool guard isn't a beforeInitialize-only hook", 409);
    const [migrator, manager] = await Promise.all([
      client.readContract({ address: guard, abi: GUARD_ABI, functionName: "migrator" }),
      client.readContract({ address: guard, abi: GUARD_ABI, functionName: "poolManager" }),
    ]).catch(unreadable);
    if (migrator.toLowerCase() !== network.migrator.toLowerCase() || manager.toLowerCase() !== uniswap.poolManager.toLowerCase()) {
      throw new TonkError("refused", "the pool guard serves another migrator or PoolManager", 409);
    }
    return guard.toLowerCase();
  })();
  known.set(network.migrator, checking);
  // A failed check is made again next time.
  checking.catch(() => known.delete(network.migrator));
  return checking;
}

/** The migrator's key for this token at this fee, refused unless it is exactly the guarded pool the migrator seeds. */
export async function checkedKey(client: PublicClient, network: TonkNetwork, uniswap: UniswapContracts, token: Address, fee: number, blockNumber?: bigint): Promise<PoolKey> {
  const at = blockNumber === undefined ? {} : { blockNumber };
  const [raw, guard] = await Promise.all([
    client.readContract({ address: network.migrator, abi: MIGRATOR_ABI, functionName: "poolKey", args: [token, fee], ...at }).catch(unreadable),
    poolGuard(client, network, uniswap),
  ]);
  const key: PoolKey = { currency0: raw.currency0, currency1: raw.currency1, fee: raw.fee, tickSpacing: raw.tickSpacing, hooks: raw.hooks };
  const ours = key.currency0.toLowerCase() === ZERO_ADDRESS && key.currency1.toLowerCase() === token.toLowerCase() && key.fee === fee && key.tickSpacing === TICK_SPACING && key.hooks.toLowerCase() === guard;
  if (!ours) throw new TonkError("refused", "not the migrator's guarded pool", 409);
  return key;
}

/** A graduated token's pool id, from the migrator's guarded key for it: its fee is the 1% protocol fee plus Crew and Creator, in v4's units. */
export async function poolIdAt(client: PublicClient, network: TonkNetwork, token: Address, crewAndCreatorBps: number, blockNumber?: bigint): Promise<`0x${string}`> {
  if (!network.uniswap) throw new TonkError("closed", "graduated pools don't trade on this network yet", 404);
  return poolIdOf(await checkedKey(client, network, network.uniswap, token, (100 + crewAndCreatorBps) * 100, blockNumber));
}
