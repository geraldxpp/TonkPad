import type { LockType } from "./rules";

const ZERO = BigInt(0);
export const DAY_SECONDS = 86_400;
/** extendDevLock refuses anything shorter. */
export const MIN_EXTENSION_DAYS = 7;

/** A creator's lock as the launchpad stores it (devLocks and devVestedCheckpoint): seconds and wei. */
export interface DevLockState {
  type: LockType;
  /** Share of the launch buy that was locked, in basis points. */
  lockedBps: number;
  start: number;
  end: number;
  total: bigint;
  claimed: bigint;
  /** What had vested when the lock was last extended; 0 for a lock never extended. */
  checkpoint: bigint;
}

/**
 * claimableDevTokens at `now` (unix seconds). A time-lock releases
 * everything at its end. A vest releases every second from its start; after
 * an extension, what had vested by then is kept and the rest vests from the
 * new start to the new end.
 */
export function claimableAt(lock: DevLockState, now: number): bigint {
  if (lock.type === "none" || lock.total === ZERO) return ZERO;
  if (now >= lock.end) return lock.total - lock.claimed;
  if (lock.type === "time") return ZERO;
  let vested = lock.checkpoint;
  if (now > lock.start) vested += ((lock.total - vested) * BigInt(now - lock.start)) / BigInt(lock.end - lock.start);
  return vested > lock.claimed ? vested - lock.claimed : ZERO;
}

/** Tokens the creator can't take yet at `now`: everything not claimed and not claimable. */
export function lockedAt(lock: DevLockState, now: number): bigint {
  return lock.total - lock.claimed - claimableAt(lock, now);
}

/** Why extendDevLock would refuse: no lock with tokens left, under 7 days, or (a vest) nothing left to vest. */
export type ExtendRefusal = "none" | "short" | "vested";

/**
 * extendDevLock at `now`: the new end is the later of now and the old end,
 * plus the extension. A vest also restarts: what has vested stays claimable
 * and the rest vests again from now. A lock can never be shortened.
 */
export function extendLock(lock: DevLockState, now: number, extraSeconds: number): DevLockState | ExtendRefusal {
  if (lock.type === "none" || lock.total <= lock.claimed) return "none";
  if (extraSeconds < MIN_EXTENSION_DAYS * DAY_SECONDS) return "short";
  const end = Math.max(now, lock.end) + extraSeconds;
  if (lock.type === "time") return { ...lock, end };
  const checkpoint = lock.claimed + claimableAt(lock, now);
  if (checkpoint >= lock.total) return "vested";
  return { ...lock, checkpoint, start: now, end };
}
