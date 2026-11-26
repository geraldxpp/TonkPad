import { createRecords } from "../src/telegram/community/records";
import { type CommunityStateFile, emptyCommunityState } from "../src/telegram/community/state";
import type { ChatSettings, PendingCheck } from "../src/telegram/community/types";
import { GROUP_ID, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";

/** Shared by the community records tests: members, a name fingerprint, and records over a state with a fake clock. */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** NOW is 12:00 UTC, so the next UTC day starts 12 hours later. */
export const MIDNIGHT = NOW + 12 * HOUR;
export const OTHER_GROUP = -1005555555555;
export const SAM = MEMBER.id;
export const KIM = 202;
export const LEE = 303;
export const NAME = "0123456789abcdef";
export const DEFAULTS: ChatSettings = { paused: false, proactive: true, strictness: "observe", raidUntil: 0 };

/** Records over `state` with a fake clock starting at `start`; saves() counts persist() calls, at() moves the clock. */
export function setup(state: CommunityStateFile = emptyCommunityState(), start = NOW) {
  let clock = start;
  let saves = 0;
  const records = createRecords(state, { persist: () => void (saves += 1), defaults: () => ({ ...DEFAULTS }), now: () => clock });
  return { records, state, saves: () => saves, at: (time: number) => void (clock = time) };
}

/** A newcomer's check in the group on message 500, due 5 minutes after NOW; `extra` overrides any field. */
export const check = (user: number, extra: Partial<PendingCheck> = {}): PendingCheck =>
  ({ chat: GROUP_ID, user, messageId: 500, joinMessageId: 499, deadline: NOW + 5 * MINUTE, target: null, tries: 0, ...extra });
