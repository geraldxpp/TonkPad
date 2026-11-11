import type { TrackedToken } from "./model";
import type { StreamLock } from "./sources/streamflow";

/**
 * Locks in Mission score v2 (approved by the owner on 7 Nov 2026). Locked
 * Missions, the Locked badge and its tab, are reserved for tokens launched on
 * Tonkpad (the owner's call, 7 Nov 2026): a firm lock of the token's supply
 * with at least 7 days left, holding at least 1% of the supply (so a lock of a
 * few tokens can't farm the badge). Locks on other launchpads count in the
 * score only: the creator's own locks with 30+ days left. Pump.fun's
 * graduation burn and the Pons locker cover every graduate and earn points.
 */
const DAY = 86_400;
export const BADGE_DAYS = 7;
export const BADGE_MIN_SHARE = 0.01;
export const POINTS_DAYS = 30;

/** Tokens still locked at `t` (unix seconds): Streamflow releases the cliff amount at the cliff, then a set amount each period. */
export function lockedAt(lock: StreamLock, t: number): number {
  if (lock.canceledAt > 0) return 0;
  if (t < lock.cliff) return lock.deposited;
  const periods = lock.period > 0 ? Math.floor((t - lock.cliff) / lock.period) : Number.POSITIVE_INFINITY;
  const released = lock.cliffAmount + periods * lock.perPeriod;
  return Math.max(0, lock.deposited - released);
}

/** Raw tokens held in firm locks for at least `days` more days, by anyone or by `sender`. */
export function lockedFor(token: TrackedToken, days: number, now: number, sender?: string): number {
  const t = Math.floor(now / 1000) + days * DAY;
  return (token.locks ?? [])
    .filter((lock) => lock.firm && lock.mint === token.address && (sender === undefined || lock.sender === sender))
    .reduce((sum, lock) => sum + lockedAt(lock, t), 0);
}

/** Share of supply in firm locks with at least 7 days left, 0–1. */
export function lockedShare(token: TrackedToken, now: number): number {
  const supply = token.supply ?? 0;
  return supply > 0 ? Math.min(1, lockedFor(token, BADGE_DAYS, now) / supply) : 0;
}

/** A Locked Mission: a Tonkpad launch with a firm lock of 1%+ of its supply, 7+ days left. */
export function isLockedMission(token: TrackedToken, now: number): boolean {
  return token.launchpad === "tonk" && lockedShare(token, now) >= BADGE_MIN_SHARE;
}

/**
 * How much of the creator's tokens, and of their launch buy, sits in the
 * creator's own firm locks for 30+ days. Their holdings are the locks plus the
 * wallet balance the last holder check saw (0 when outside the 20 largest).
 */
export function creatorLock(token: TrackedToken, now: number): { ofHoldings: number; ofLaunchBuy: number } {
  const locked = lockedFor(token, POINTS_DAYS, now, token.creator);
  if (locked <= 0) return { ofHoldings: 0, ofLaunchBuy: 0 };
  // A tonkfun.fun lock earns nothing under the badge's 1% of supply: a dust buy with a dust lock isn't a commitment (review finding M-2).
  if (token.launchpad === "tonk" && locked < BADGE_MIN_SHARE * (token.supply ?? 0)) return { ofHoldings: 0, ofLaunchBuy: 0 };
  const holdings = lockedFor(token, 0, now, token.creator) + (token.creatorHeld ?? 0);
  const launchBuy = token.creatorBuyShare * (token.supply ?? 0);
  return {
    ofHoldings: holdings > 0 ? Math.min(1, locked / holdings) : 0,
    ofLaunchBuy: launchBuy > 0 ? Math.min(1, locked / launchBuy) : 0,
  };
}

/** Pool liquidity burned or locked at graduation: Pump.fun burns its PumpSwap LP (checked on-chain), Pons locks its Uniswap v4 position. */
export function poolLockedOrBurned(token: TrackedToken): boolean {
  return token.graduated && (token.launchpad === "pump" || token.launchpad === "pons");
}
