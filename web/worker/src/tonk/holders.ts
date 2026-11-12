import { TOTAL_SUPPLY } from "@/shared/tonk/curve";
import type { Address } from "../alerts/types";
import type { TonkState } from "./state";

/**
 * Exact holders of a tonkfun.fun launch, from its token's own Transfer events
 * since the launch: every wallet-to-wallet transfer counts, and so does
 * everything after graduation. System addresses are labelled, not counted:
 * the launchpad (the curve and the creator's locked tokens), Uniswap's
 * PoolManager (the pool), the migrator, and burned tokens (0xdead). Under
 * one token is dust, and isn't counted either.
 */
export const DUST = BigInt(10) ** BigInt(18);
export const DEAD: Address = "0x000000000000000000000000000000000000dead";
export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/** The contracts that hold a launch's tokens for it. */
export interface SystemAddresses {
  launchpad: Address;
  migrator: Address;
  poolManager: Address;
}

export type SystemRole = "launchpad" | "pool" | "migrator" | "burned";

export function systemRole(address: string, system: SystemAddresses): SystemRole | null {
  if (address === system.launchpad) return "launchpad";
  if (address === system.poolManager) return "pool";
  if (address === system.migrator) return "migrator";
  return address === DEAD || address === ZERO_ADDRESS ? "burned" : null;
}

/** Moves `value` wei from one balance to another; the zero address mints and burns. */
export function applyTransfer(s: TonkState, from: string, to: string, value: bigint): void {
  if (from === to || value <= BigInt(0)) return;
  const move = (address: string, delta: bigint) => {
    if (address === ZERO_ADDRESS) return;
    const next = BigInt(s.balances[address] ?? "0") + delta;
    if (next > BigInt(0)) s.balances[address] = next.toString();
    else delete s.balances[address];
  };
  move(from, -value);
  move(to, value);
  s.holdersDirty = true;
}

/** A wallet's balance in wei. */
export const balanceOf = (s: TonkState, address: string): bigint => BigInt(s.balances[address.toLowerCase()] ?? "0");

/** Counted holders (no system address, no dust), largest first. */
export function countedHolders(s: TonkState, system: SystemAddresses): Array<[string, bigint]> {
  return Object.entries(s.balances)
    .map(([address, raw]): [string, bigint] => [address, BigInt(raw)])
    .filter(([address, amount]) => amount >= DUST && systemRole(address, system) === null)
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : a[0] < b[0] ? -1 : 1));
}

export interface HolderFigures {
  count: number;
  /** Share of supply the 10 largest counted holders have, 0–1. */
  top10Share: number;
}

export function holderFigures(s: TonkState, system: SystemAddresses): HolderFigures {
  const counted = countedHolders(s, system);
  const top10 = counted.slice(0, 10).reduce((sum, [, amount]) => sum + amount, BigInt(0));
  return { count: counted.length, top10Share: Number((top10 * BigInt(1_000_000)) / TOTAL_SUPPLY) / 1_000_000 };
}
