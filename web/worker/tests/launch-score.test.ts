import { describe, expect, it } from "vitest";
import { TOTAL_SUPPLY, WEI } from "@/shared/tonk/curve";
import { type DevLockState, lockedAt } from "@/shared/tonk/lock";
import { lockedAmount, type LockSettings } from "@/shared/tonk/rules";
import { isLockedMission as pageLockedMission, launchScore, missionScore as pageScore, scoreLevel } from "@/shared/tonk/score";
import { isLockedMission } from "../src/locks";
import { missionScore } from "../src/score";
import type { StreamLock } from "../src/sources/streamflow";
import { MIN, NOW, SEC, tracked } from "./fixtures";

const DAY = 86_400;
const SUPPLY = Number(TOTAL_SUPPLY);

/**
 * A tonkfun.fun launch as the worker will track it: fixed supply, no freeze,
 * the creator's buy, its Crew fee, and the dev lock in the worker's lock
 * shape (a time-lock releases everything at its end; a vest every second).
 */
function launched(boughtShare: number, lock: LockSettings, crewBps: number) {
  const bought = BigInt(Math.round(boughtShare * 1e9)) * WEI;
  const locked = Number(lockedAmount(bought, lock));
  const token = tracked({ launchpad: "tonk", chain: "rh", mintRevoked: true, freezeRevoked: true, creatorBuyShare: boughtShare, supply: SUPPLY, crewBps }, 0);
  const start = NOW / SEC;
  const end = start + lock.days * DAY;
  const shape: StreamLock = {
    escrow: "escrow",
    sender: token.creator,
    recipient: token.creator,
    mint: token.address,
    start,
    cliff: lock.type === "time" ? end : start,
    end,
    canceledAt: 0,
    deposited: locked,
    cliffAmount: lock.type === "time" ? locked : 0,
    perPeriod: lock.type === "time" ? 0 : locked / (lock.days * DAY),
    period: 1,
    firm: true,
  };
  return { bought, token: { ...token, locks: lock.type === "none" ? [] : [shape], creatorHeld: Number(bought) - locked } };
}

const LOCKS: LockSettings[] = [
  { type: "none", sharePct: 100, days: 0 },
  ...[7, 29, 30, 31, 90, 180, 365].flatMap((days) => [50, 55, 75, 80, 100].map((sharePct): LockSettings => ({ type: "time", sharePct, days }))),
  ...[30, 60, 90, 180, 360].flatMap((days) => [50, 55, 60, 65, 75, 80, 100].map((sharePct): LockSettings => ({ type: "linear", sharePct, days }))),
];

describe("a launch's Mission score: the Creator Studio's preview and the worker agree", () => {
  // 0.000001 is a dust buy: no lock on it can reach 1% of supply, so none counts on either side.
  it.each([0, 0.000001, 0.0172, 0.0421, 0.0814, 0.2])("for a creator buy of %s of supply, across every lock and Crew setting", (share) => {
    for (const lock of LOCKS) {
      for (const crewBps of [0, 100, 200]) {
        const { bought, token } = launched(share, lock, crewBps);
        const preview = launchScore({ bought, lock, crewBps });
        const label = `${lock.sharePct}% ${lock.type} ${lock.days}d, crew ${crewBps}`;
        // A minute in, still a new launch; then just past its first ten minutes.
        expect(missionScore(token, NOW + MIN).score, `${label}, at launch`).toBe(preview.now);
        expect(missionScore(token, NOW + 10 * MIN + SEC).score, `${label}, after 10 minutes`).toBe(preview.later);
      }
    }
  });

  it("gives the prompt's examples their scores", () => {
    const bought = BigInt(42_095_276) * WEI;
    const score = (lock: LockSettings, crewBps = 200, tokens = bought) => {
      const result = launchScore({ bought: tokens, lock, crewBps });
      return [result.now, result.later];
    };
    expect(score({ type: "linear", sharePct: 80, days: 180 })).toEqual([70, 80]);
    expect(score({ type: "linear", sharePct: 65, days: 180 })).toEqual([70, 80]);
    // Exactly half still locked after 30 days: a vest keeps releasing, so it doesn't count.
    expect(score({ type: "linear", sharePct: 60, days: 180 })).toEqual([60, 70]);
    expect(score({ type: "linear", sharePct: 50, days: 180 })).toEqual([60, 70]);
    expect(score({ type: "time", sharePct: 50, days: 90 })).toEqual([70, 80]);
    expect(score({ type: "time", sharePct: 50, days: 30 })).toEqual([60, 70]);
    expect(score({ type: "none", sharePct: 100, days: 0 })).toEqual([60, 70]);
    expect(score({ type: "none", sharePct: 100, days: 0 }, 200, BigInt(81_394_301) * WEI)).toEqual([52, 62]);
    expect(score({ type: "none", sharePct: 100, days: 0 }, 200, BigInt(0))).toEqual([60, 70]);
    expect(score({ type: "none", sharePct: 100, days: 0 }, 0, BigInt(200_000_000) * WEI)).toEqual([35, 45]);
    expect([scoreLevel(80), scoreLevel(75), scoreLevel(70), scoreLevel(49)]).toEqual(["Safe", "Safe", "Caution", "Risky"]);
  });

  it("agrees on the Locked badge: the lock holds 1% of supply or more a week after launch", () => {
    const cases: [number, LockSettings, boolean][] = [
      [0.0421, { type: "linear", sharePct: 80, days: 180 }, true],
      [0.0172, { type: "linear", sharePct: 80, days: 180 }, true],
      [0.0172, { type: "linear", sharePct: 50, days: 180 }, false],
      [0.0421, { type: "time", sharePct: 50, days: 30 }, true],
      [0.0421, { type: "time", sharePct: 100, days: 7 }, false],
      [0.0421, { type: "linear", sharePct: 100, days: 8 }, false],
      [0.0421, { type: "none", sharePct: 100, days: 0 }, false],
      [0, { type: "linear", sharePct: 80, days: 180 }, false],
    ];
    for (const [share, lock, badge] of cases) {
      const { bought, token } = launched(share, lock, 200);
      expect(launchScore({ bought, lock, crewBps: 200 }).lockedBadge, JSON.stringify(lock)).toBe(badge);
      expect(isLockedMission(token, NOW + MIN), JSON.stringify(lock)).toBe(badge);
    }
  });
});

/** The same lock as the launchpad stores it, for the token page's maths. */
function onChain(bought: bigint, lock: LockSettings): DevLockState | null {
  if (lock.type === "none" || bought === BigInt(0)) return null;
  const start = NOW / SEC;
  return { type: lock.type, lockedBps: lock.sharePct * 100, start, end: start + lock.days * DAY, total: lockedAmount(bought, lock), claimed: BigInt(0), checkpoint: BigInt(0) };
}

/** Days after launch, chosen off the exact moments a lock crosses a threshold (where float and integer maths may round apart). */
const AGES = [1 / 1440, 0.5, 1.5, 29.5, 30.5, 59.5, 89.5, 90.5, 149.5, 179.5, 180.5, 400];

describe("a live mission's Mission score: the token page and the worker agree over a lock's life", () => {
  it.each([0, 0.0172, 0.0421, 0.0814, 0.2])("for a creator buy of %s of supply, as its lock runs down", (share) => {
    for (const lock of LOCKS) {
      for (const crewBps of [0, 200]) {
        const { bought, token } = launched(share, lock, crewBps);
        const state = onChain(bought, lock);
        const held = bought - (state?.total ?? BigInt(0));
        for (const days of AGES) {
          const ageSeconds = Math.round(days * DAY);
          const t = NOW / SEC + ageSeconds;
          const zero = BigInt(0);
          const page = pageScore({ launchBuy: bought, creatorHeld: held, lockedNow: state ? lockedAt(state, t) : zero, lockedIn30Days: state ? lockedAt(state, t + 30 * DAY) : zero, crewBps, ageSeconds });
          const label = `${lock.sharePct}% ${lock.type} ${lock.days}d, crew ${crewBps}, day ${days}`;
          expect(page.score, label).toBe(missionScore(token, NOW + ageSeconds * SEC).score);
          expect(pageLockedMission(state ? lockedAt(state, t + 7 * DAY) : zero), `${label}, Locked badge`).toBe(isLockedMission(token, NOW + ageSeconds * SEC));
        }
      }
    }
  });

  it("scores the owner's first test launch as the page shows it: 80, and 70 in its first ten minutes", () => {
    const bought = BigInt("124002358490566037735849057");
    const lock: DevLockState = { type: "linear", lockedBps: 8000, start: 0, end: 180 * DAY, total: BigInt("99201886792452830188679245"), claimed: BigInt(0), checkpoint: BigInt(0) };
    const at = (seconds: number) => pageScore({ launchBuy: bought, creatorHeld: bought - lock.total, lockedNow: lockedAt(lock, seconds), lockedIn30Days: lockedAt(lock, seconds + 30 * DAY), crewBps: 200, ageSeconds: seconds });
    expect([at(60).score, at(4_200).score, at(4_200).level]).toEqual([70, 80, "Safe"]);
    // 37.5 days in, less than half the launch buy is still locked 30 days out: the buy's penalty returns.
    expect([at(37 * DAY).score, at(38 * DAY).score]).toEqual([80, 72]);
    // From day 75 the lock is under half the creator's tokens 30 days out, so its points go too.
    expect([at(74 * DAY).score, at(76 * DAY).score]).toEqual([72, 62]);
  });
});
