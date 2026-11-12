import { Batch } from "../alerts/reads";
import type { AlertRpc } from "../alerts/rpc";
import type { Address } from "../alerts/types";
import type { TonkFeedConfig } from "./config";
import { isGuardShaped, named } from "./reads";

/**
 * The migrator's pool guard, once it is shown to be a beforeInitialize-only
 * hook that serves this migrator on Uniswap's official PoolManager (the
 * checks the app makes before it quotes a pool), or "refused". A guard that
 * fails them is never used, so no pool is followed at all. A read that
 * fails throws, and the check is made again on the next poll.
 */
export async function checkGuard(rpc: AlertRpc, config: TonkFeedConfig, block: number): Promise<Address | "refused"> {
  const first = new Batch();
  const guardOf = first.add(named(config.migrator, "initializationGuard", block));
  const managerOf = first.add(named(config.migrator, "poolManager", block));
  await first.run(rpc);
  const guard = guardOf();
  if (!guard || !isGuardShaped(guard) || managerOf() !== config.poolManager) return "refused";
  const second = new Batch();
  const migrator = second.add(named(guard, "migrator", block));
  const manager = second.add(named(guard, "poolManager", block));
  await second.run(rpc);
  return migrator() === config.migrator && manager() === config.poolManager ? guard : "refused";
}
