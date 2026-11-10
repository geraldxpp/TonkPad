/**
 * The launchpad's launch rules (TonkpadRobinhood._validateLaunchEconomics):
 * the fee options the Creator Studio offers, the dev lock, and the Creator
 * Rewards tier a lock unlocks.
 */
const BPS = BigInt(10_000);

/** How the creator's launch buy is locked. The contract's enum: none 0, time-lock 1, linear vesting 2. */
export type LockType = "none" | "time" | "linear";
export const LOCK_TYPE_ID: Record<LockType, number> = { none: 0, time: 1, linear: 2 };

export interface LockSettings {
  type: LockType;
  /** Share of the dev buy that is locked, 50–100. */
  sharePct: number;
  /** How long the lock runs, in days (a month is 30 days). */
  days: number;
}

/** Crew and Creator Rewards share at most 4% on top of the fixed 1% protocol fee: 5% in all. */
export const REWARD_POOL_BPS = 400;
/** Crew is off or at least 1%, so a token can't wear the Crew badge for a token fee. */
export const CREW_OPTIONS = [0, 100, 150, 200, 300, 400] as const;
export const CREATOR_OPTIONS = [0, 50, 100, 150, 200, 300, 400] as const;

export const MIN_LOCK_SHARE = 50;
export const MIN_LOCK_DAYS = 7;
/** The longest custom time-lock the screen offers; a lock can be extended on-chain later. */
export const MAX_LOCK_DAYS = 365;

export type LockTier = "none" | "standard" | "ironclad";
/** The most Creator Rewards each tier allows, in basis points. */
export const TIER_CREATOR_MAX: Record<LockTier, number> = { none: 50, standard: 200, ironclad: 400 };

/** True for a lock the contract accepts: a dev buy, 50–100% of it, for 7 days or more. */
export function isLocked(hasDevBuy: boolean, lock: LockSettings): boolean {
  return hasDevBuy && lock.type !== "none" && lock.sharePct >= MIN_LOCK_SHARE && lock.days >= MIN_LOCK_DAYS;
}

/** Ironclad: 80%+ locked for 90+ days. Standard: 50%+ for 30+ days. Otherwise none. */
export function lockTier(hasDevBuy: boolean, lock: LockSettings): LockTier {
  if (!isLocked(hasDevBuy, lock)) return "none";
  if (lock.sharePct >= 80 && lock.days >= 90) return "ironclad";
  return lock.days >= 30 ? "standard" : "none";
}

/** The locked part of a dev buy, rounded down as the contract does. */
export function lockedAmount(bought: bigint, lock: LockSettings): bigint {
  return lock.type === "none" ? BigInt(0) : (bought * BigInt(lock.sharePct * 100)) / BPS;
}

/**
 * Tokens still locked `afterDays` after launch. A time-lock holds everything
 * until its end; a linear vest releases every second. Both hold nothing once
 * the end is reached.
 */
export function stillLocked(locked: bigint, lock: LockSettings, afterDays: number): bigint {
  if (lock.type === "none" || afterDays >= lock.days) return BigInt(0);
  return lock.type === "time" ? locked : (locked * BigInt(lock.days - afterDays)) / BigInt(lock.days);
}

/** The highest option that doesn't pass `max`. */
export function optionAtMost(options: readonly number[], max: number): number {
  let best = options[0];
  for (const option of options) if (option <= max) best = option;
  return best;
}
