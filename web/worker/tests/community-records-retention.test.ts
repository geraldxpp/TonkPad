// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emptyCommunityState } from "../src/telegram/community/state";
import { COUNTER_KEYS } from "../src/telegram/community/types";
import { ADMIN_CHAT_ID, GROUP_ID } from "./community-fixtures";
import { check, DAY, HOUR, KIM, LEE, MIDNIGHT, MINUTE, NAME, OTHER_GROUP, SAM, setup } from "./community-records-setup";
import { NOW } from "./fixtures";

describe("community records' retention", () => {
  it("drops each record at the end of its retention, not before", () => {
    const { records, state, saves } = setup();
    records.addOffence(GROUP_ID, SAM, NOW, "invite_link", false);
    records.markNewcomer(GROUP_ID, KIM, NOW, NOW + 3 * DAY);
    // Not yet posted (message ID 0), so its going schedules no delete of a check message: that has a test of its own below.
    records.setPending(check(LEE, { messageId: 0 }));
    records.markAppeal(GROUP_ID, SAM, NOW);
    records.scheduleDelete(GROUP_ID, 700, NOW + MINUTE);
    records.scheduleDelete(ADMIN_CHAT_ID, 800, NOW + 47 * HOUR);
    records.count(GROUP_ID, "removed", NOW);
    records.setSpend({ day: "2026-11-06", lanes: { triage: 0.2, group: 0.1, proactive: 0, private: 0.05 } });
    records.trust(GROUP_ID, SAM, NAME, NOW);
    const steps: Array<[number, () => boolean]> = [
      // A check until 5 minutes after its deadline (when its restriction ends too), so the tick can still remove them.
      [NOW + 10 * MINUTE, () => records.pending(GROUP_ID, LEE) !== null],
      [MIDNIGHT, () => records.spend() !== null],
      [NOW + DAY, () => records.appealAt(GROUP_ID, SAM) === NOW],
      [MIDNIGHT + DAY, () => records.counts(GROUP_ID, NOW).removed === 1],
      [NOW + 48 * HOUR, () => state.deletes.length === 2],
      [NOW + 3 * DAY, () => records.isNewcomer(GROUP_ID, KIM, NOW)],
      [NOW + 7 * DAY, () => records.offences(GROUP_ID, SAM, NOW).n === 1],
    ];
    for (const [end, kept] of steps) {
      const before = saves();
      records.prune(end - 1);
      expect(kept(), `kept just before ${end - NOW} ms`).toBe(true);
      expect(saves()).toBe(before);
      records.prune(end);
      expect(kept(), `dropped at ${end - NOW} ms`).toBe(false);
      expect(saves()).toBe(before + 1);
    }
    expect(records.trustedName(GROUP_ID, SAM, NAME)).toBe(true);
    expect({ ...state, trusted: {} }).toEqual(emptyCommunityState());
  });

  it("never keeps a check or a newcomer past the privacy page's limits, whatever time it was given", () => {
    const { records } = setup();
    records.setPending(check(SAM, { deadline: NOW + 10 * MINUTE }));
    records.setPending(check(KIM, { deadline: NOW + 20 * MINUTE }));
    records.markNewcomer(GROUP_ID, LEE, NOW, NOW + 30 * DAY);
    records.prune(NOW);
    expect(records.pending(GROUP_ID, SAM)).not.toBeNull();
    expect(records.pending(GROUP_ID, KIM)).toBeNull();
    records.prune(NOW + 7 * DAY - 1);
    expect(records.isNewcomer(GROUP_ID, LEE, NOW + 7 * DAY - 1)).toBe(true);
    records.prune(NOW + 7 * DAY);
    expect(records.isNewcomer(GROUP_ID, LEE, NOW + 7 * DAY)).toBe(false);
  });

  it("prunes at load, and saves that with the first prune", () => {
    const old = setup(emptyCommunityState(), NOW - 9 * DAY);
    old.records.addOffence(GROUP_ID, SAM, NOW - 8 * DAY, "flood", false);
    old.records.setPending(check(KIM, { deadline: NOW - 6 * MINUTE }));
    old.records.scheduleDelete(GROUP_ID, 900, NOW - 47 * HOUR);
    old.records.count(GROUP_ID, "answers", NOW - 2 * DAY);
    old.records.markAppeal(GROUP_ID, LEE, NOW - 2 * HOUR);
    const { records, saves } = setup(old.state, NOW);
    expect(old.state.warnings).toEqual({});
    expect(old.state.pending).toEqual({});
    // The old delete is past Telegram's 48 hours; KIM's check message goes with their record (its 48 hours counted from 15 minutes before the deadline).
    expect(old.state.deletes).toEqual([{ chat: GROUP_ID, messageId: 500, due: NOW, added: NOW - 21 * MINUTE }]);
    expect(old.state.counters).toEqual({});
    expect(records.appealAt(GROUP_ID, LEE)).toBe(NOW - 2 * HOUR);
    expect(saves()).toBe(0);
    records.prune(NOW);
    expect(saves()).toBe(1);
    records.prune(NOW + 1);
    expect(saves()).toBe(1);
  });

  it("keeps a check until 5 minutes after its deadline, at load too, so the first tick removes whoever ran out while the worker was down", () => {
    const old = setup(emptyCommunityState(), NOW - 20 * MINUTE);
    old.records.setPending(check(SAM, { deadline: NOW - 90_000 }));
    old.records.setPending(check(KIM, { deadline: NOW - 5 * MINUTE }));
    const { records, saves } = setup(old.state, NOW);
    expect(records.pending(GROUP_ID, SAM)).not.toBeNull();
    expect(records.pending(GROUP_ID, KIM)).toBeNull();
    expect(records.duePending(NOW).map((p) => p.user)).toEqual([SAM]);
    records.prune(NOW + 3 * MINUTE + 29_999);
    expect(records.pending(GROUP_ID, SAM)).not.toBeNull();
    records.prune(NOW + 3 * MINUTE + 30_000);
    expect(records.pending(GROUP_ID, SAM)).toBeNull();
    expect(saves()).toBe(2);
  });

  it("deletes a check message with the last record on it that runs out, after a restart too, and never one a newcomer is still on", () => {
    const old = setup(emptyCommunityState(), NOW - 20 * MINUTE);
    // Message 500: both ran out while the worker was down. Message 600: one ran out, one is still within its time. Not posted: nothing to delete.
    old.records.setPending(check(SAM, { deadline: NOW - 6 * MINUTE }));
    old.records.setPending(check(KIM, { deadline: NOW - 7 * MINUTE }));
    old.records.setPending(check(LEE, { messageId: 600, deadline: NOW - 8 * MINUTE }));
    old.records.setPending(check(404, { messageId: 600, deadline: NOW - MINUTE }));
    old.records.setPending(check(505, { messageId: 0, deadline: NOW - 9 * MINUTE }));
    old.records.scheduleDelete(GROUP_ID, 500, NOW + HOUR);
    const { records, state } = setup(old.state, NOW);
    // 500 was already to be deleted: scheduled once, as it was.
    expect(state.deletes).toEqual([{ chat: GROUP_ID, messageId: 500, due: NOW + HOUR, added: NOW - 20 * MINUTE }]);
    expect(records.pendingOn(GROUP_ID, 600).map((p) => p.user)).toEqual([404]);
    // The last one on 600 runs out: its message goes with them.
    records.prune(NOW + 4 * MINUTE);
    expect(records.pendingOn(GROUP_ID, 600)).toEqual([]);
    expect(records.dueDeletes(NOW + 4 * MINUTE)).toEqual([{ chat: GROUP_ID, messageId: 600 }]);
    expect(state.deletes.find((d) => d.messageId === 600)?.added).toBe(NOW - MINUTE - 15 * MINUTE);
  });

  it("counts each group's day by UTC midnight", () => {
    const { records, saves } = setup();
    records.count(GROUP_ID, "answers", MIDNIGHT - 1);
    records.count(GROUP_ID, "answers", MIDNIGHT - 1, 2);
    records.count(GROUP_ID, "answers", MIDNIGHT);
    expect(records.counts(GROUP_ID, MIDNIGHT - 1).answers).toBe(3);
    expect(records.counts(GROUP_ID, MIDNIGHT).answers).toBe(1);
    expect(records.counts(OTHER_GROUP, MIDNIGHT).answers).toBe(0);
    expect(Object.keys(records.counts(GROUP_ID, MIDNIGHT))).toEqual([...COUNTER_KEYS]);
    for (const n of [0, -1, 1.5]) records.count(GROUP_ID, "answers", MIDNIGHT, n);
    records.count(GROUP_ID, "words" as "answers", MIDNIGHT);
    expect(saves()).toBe(3);
  });

  it("schedules the bot's own deletes once per message, and forgets them when done", () => {
    const { records, state, at } = setup();
    records.scheduleDelete(GROUP_ID, 700, NOW + MINUTE);
    at(NOW + 10 * MINUTE);
    records.scheduleDelete(GROUP_ID, 700, NOW + 20 * MINUTE);
    records.scheduleDelete(GROUP_ID, 0, NOW);
    expect(state.deletes).toEqual([{ chat: GROUP_ID, messageId: 700, due: NOW + 20 * MINUTE, added: NOW }]);
    expect(records.dueDeletes(NOW + 20 * MINUTE - 1)).toEqual([]);
    expect(records.dueDeletes(NOW + 20 * MINUTE)).toEqual([{ chat: GROUP_ID, messageId: 700 }]);
    // Past Telegram's 48 hours a delete can't be done, so it is no longer offered.
    expect(records.dueDeletes(NOW + 48 * HOUR)).toEqual([]);
    records.doneDelete(GROUP_ID, 700);
    expect(state.deletes).toEqual([]);
  });
});
