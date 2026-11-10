import type { ScoreLevel } from "@/shared/types/token";
import { percentOf, TOTAL_SUPPLY } from "./curve";
import { lockedAmount, type LockSettings, stillLocked } from "./rules";

/**
 * A tonkfun.fun launch's Mission score at launch: the rows of Mission score
 * v2 (worker/src/score.ts) that are known before anyone has traded. The
 * Creator Studio previews it with this, and a test holds it to the worker's
 * own number, so a token never launches on one score and lists on another.
 */
export type ScoreRowKey = "base" | "authority" | "lock" | "crew" | "devBuy" | "age";

export interface LaunchScore {
  /** At launch, with the new-launch penalty. */
  now: number;
  /** Ten minutes on, once that penalty lifts and if nothing else changes. */
  later: number;
  rows: { key: ScoreRowKey; points: number }[];
  /** The lock earns its points (and cancels the unlocked-buy penalty). */
  lockCounts: boolean;
  /** The launch wears the Locked badge. */
  lockedBadge: boolean;
}

export interface LaunchScoreInput {
  /** Tokens the creator buys inside the launch, in wei. */
  bought: bigint;
  lock: LockSettings;
  crewBps: number;
}

/** v2's levels: Safe from 75, Caution from 50, else Risky. */
export function scoreLevel(score: number): ScoreLevel {
  return score >= 75 ? "Safe" : score >= 50 ? "Caution" : "Risky";
}

/**
 * v2 counts a creator lock when half or more of their tokens are locked with
 * 30+ days left. At launch those tokens are the launch buy, so the test is
 * made on the settings (rounding can't decide it). A time-lock holds its
 * share until the end, so half is enough. A linear vest releases every
 * second, so it needs more than half still locked 30 days out: a vest at
 * exactly half would lose the points seconds after launch.
 */
export function lockCounts(bought: bigint, lock: LockSettings): boolean {
  if (bought <= BigInt(0) || lock.type === "none") return false;
  if (lock.type === "time") return lock.sharePct >= 50 && lock.days > 30;
  return lock.sharePct * (lock.days - 30) > 50 * lock.days;
}

/** The Locked badge: the tokens still locked 7 days after launch are 1% of supply or more. */
export function earnsLockedBadge(bought: bigint, lock: LockSettings): boolean {
  return stillLocked(lockedAmount(bought, lock), lock, 7) * BigInt(100) >= TOTAL_SUPPLY;
}

const clamp = (score: number) => Math.round(Math.min(99, Math.max(1, score)));

export function launchScore({ bought, lock, crewBps }: LaunchScoreInput): LaunchScore {
  const counts = lockCounts(bought, lock);
  const share = percentOf(bought, TOTAL_SUPPLY);
  const rows: LaunchScore["rows"] = [
    { key: "base", points: 50 },
    // Supply is fixed at launch and nobody can freeze transfers: v2's +8 and +7.
    { key: "authority", points: 15 },
    { key: "lock", points: counts ? 10 : 0 },
    { key: "crew", points: crewBps >= 100 ? 5 : 0 },
    { key: "devBuy", points: counts ? 0 : share > 15 ? -20 : share > 5 ? -8 : 0 },
    { key: "age", points: -10 },
  ];
  const later = rows.reduce((sum, row) => sum + (row.key === "age" ? 0 : row.points), 0);
  return { now: clamp(later - 10), later: clamp(later), rows, lockCounts: counts, lockedBadge: earnsLockedBadge(bought, lock) };
}

/** What the chain can say about a live mission's creator, for the score. Amounts in wei. */
export interface MissionScoreInput {
  /** Tokens the creator bought inside the launch. */
  launchBuy: bigint;
  /** Tokens in the creator's wallet now. */
  creatorHeld: bigint;
  /** Tokens the creator's lock still holds back now, and will still hold back 30 days from now. */
  lockedNow: bigint;
  lockedIn30Days: bigint;
  crewBps: number;
  /** Seconds since the launch. */
  ageSeconds: number;
}

/**
 * A live mission's score from chain facts alone: v2's rows for the
 * authorities, the creator's buy and lock, Crew Rewards and the first ten
 * minutes. The market rows (holders, trades, volume) join with the indexer.
 * A test holds it to the worker's score for the same facts over a lock's life.
 */
export function missionScore(input: MissionScoreInput): { score: number; level: ScoreLevel; rows: LaunchScore["rows"] } {
  const two = BigInt(2);
  const holdings = input.lockedNow + input.creatorHeld;
  const halfOfHoldings = input.lockedIn30Days > BigInt(0) && input.lockedIn30Days * two >= holdings;
  const halfOfLaunchBuy = input.lockedIn30Days > BigInt(0) && input.lockedIn30Days * two >= input.launchBuy;
  const share = percentOf(input.launchBuy, TOTAL_SUPPLY);
  const rows: LaunchScore["rows"] = [
    { key: "base", points: 50 },
    { key: "authority", points: 15 },
    { key: "lock", points: halfOfHoldings ? 10 : 0 },
    { key: "crew", points: input.crewBps >= 100 ? 5 : 0 },
    { key: "devBuy", points: halfOfLaunchBuy ? 0 : share > 15 ? -20 : share > 5 ? -8 : 0 },
    { key: "age", points: input.ageSeconds < 600 ? -10 : 0 },
  ];
  const score = clamp(rows.reduce((sum, row) => sum + row.points, 0));
  return { score, level: scoreLevel(score), rows };
}

/** The Locked badge on a live mission: the tokens still locked 7 days from now are 1% of supply or more. */
export function isLockedMission(lockedIn7Days: bigint): boolean {
  return lockedIn7Days * BigInt(100) >= TOTAL_SUPPLY;
}
