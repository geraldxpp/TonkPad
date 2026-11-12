import { TOTAL_SUPPLY } from "@/shared/tonk/curve";
import { DAY_SECONDS, lockedAt } from "@/shared/tonk/lock";
import { missionLock } from "@/shared/tonk/mission";
import { isLockedMission, missionScore } from "@/shared/tonk/score";
import type { ScoreLevel } from "@/shared/types/token";
import { balanceOf } from "./holders";
import type { TonkState } from "./state";

/**
 * A tonkfun.fun launch's Mission score and Locked badge, from chain facts
 * alone: the very functions the token page uses (shared/tonk/score.ts) on
 * the same facts (the launch buy, the creator's balance, the stored lock,
 * Crew Rewards, the launch time), so Explore and the token page never show
 * two scores for one token. `worker/tests/tonk-score.test.ts` holds them
 * together over a lock's life.
 */
const ZERO = BigInt(0);
const seconds = (now: number) => Math.floor(now / 1000);

/** Tokens the creator's lock still holds back `days` from `now`, in wei. */
function lockedIn(s: TonkState, now: number, days: number): bigint {
  return s.lock ? lockedAt(missionLock(s.lock), seconds(now) + days * DAY_SECONDS) : ZERO;
}

export function tonkScore(s: TonkState, creator: string, now: number): { score: number; level: ScoreLevel } {
  const { score, level } = missionScore({
    launchBuy: BigInt(s.devBought),
    creatorHeld: balanceOf(s, creator),
    lockedNow: lockedIn(s, now, 0),
    lockedIn30Days: lockedIn(s, now, 30),
    crewBps: s.crewBps,
    ageSeconds: seconds(now) - s.launchTime,
  });
  return { score, level };
}

/** The Locked badge (and the Locked Missions tab): 1% of supply or more still locked a week from now. */
export const tonkLocked = (s: TonkState, now: number) => isLockedMission(lockedIn(s, now, 7));

/** Share of supply still locked a week from now, 0–1: how the Locked Missions tab ranks. */
export const tonkLockedShare = (s: TonkState, now: number) => Number((lockedIn(s, now, 7) * BigInt(1_000_000)) / TOTAL_SUPPLY) / 1_000_000;

/** The creator's tokens the launchpad still holds (locked, or unlocked but not yet claimed), wei: the "Locked (creator)" row. */
export const heldForCreator = (s: TonkState): bigint => (s.lock ? BigInt(s.lock.total) - BigInt(s.lock.claimed) : ZERO);
