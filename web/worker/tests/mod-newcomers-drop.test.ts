import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIFTED, MUTED } from "../src/telegram/community/permissions";
import type { ChatId } from "../src/telegram/community/types";
import { createNewcomers } from "../src/telegram/mod/newcomers";
import { callsOf, fakeAdmins, GROUP_ID, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";
import { MINUTE, person, SECOND, setup, unix } from "./mod-newcomers-setup";

const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a group the agent stops running (dropChat)", () => {
  it("ends its pending checks without punishment: records dropped, the check deleted, the restriction lifted, and nobody removed at the deadline", async () => {
    const { out, records, alerts, newcomers, at, join } = setup();
    await join([person(201), person(202)], 71, NOW);
    expect(records.pendingOn(GROUP_ID, 5001)).toHaveLength(2);
    newcomers.dropChat(GROUP_ID);
    await vi.advanceTimersByTimeAsync(0);
    expect(records.pendingIn(GROUP_ID)).toEqual([]);
    expect(callsOf(out.log, "remove")).toContainEqual([GROUP_ID, [5001]]);
    // Lifted after the check's own restriction, in each newcomer's line.
    expect(callsOf(out.log, "restrict")).toEqual([
      [GROUP_ID, 201, MUTED, unix(NOW + 10 * MINUTE)],
      [GROUP_ID, 202, MUTED, unix(NOW + 10 * MINUTE)],
      [GROUP_ID, 201, LIFTED, 0],
      [GROUP_ID, 202, LIFTED, 0],
    ]);
    await newcomers.tick(at(NOW + 5 * MINUTE + 6 * SECOND));
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "kick")).toEqual([]);
    expect(alerts).toEqual([]);
  });

  it("handles no join there after, and lets a check still on its way go with nobody on it", async () => {
    const { out, records, newcomers, join } = setup({ out: { send: () => after(3 * SECOND, 5001) } });
    void join([person(201)], 71, NOW);
    await vi.advanceTimersByTimeAsync(SECOND);
    newcomers.dropChat(GROUP_ID);
    await join([person(202)], 72, NOW + 2 * SECOND);
    await vi.advanceTimersByTimeAsync(3 * SECOND);
    expect(records.pendingIn(GROUP_ID)).toEqual([]);
    expect(callsOf(out.log, "restrict").filter((c) => c[1] === 202)).toEqual([]);
    expect(callsOf(out.log, "remove")).toContainEqual([GROUP_ID, [5001]]);
    expect(callsOf(out.log, "restrict").filter((c) => c[1] === 201).map((c) => c[2])).toEqual([MUTED, LIFTED]);
  });

  it("never fails a check in a group it doesn't run, though its record is still there", async () => {
    const records = memoryRecords({ strictness: "normal" });
    const OTHER: ChatId = -1_005_555_555_555;
    records.setPending({ chat: OTHER, user: 301, messageId: 4444, joinMessageId: 70, deadline: NOW - SECOND, target: null, tries: 0 });
    records.setPending({ chat: GROUP_ID, user: 302, messageId: 4445, joinMessageId: 71, deadline: NOW - SECOND, target: null, tries: 0 });
    const out = recordOut();
    const newcomers = createNewcomers({
      out, records, words: () => testWords, alerts: { alert: () => undefined }, recentIds: () => [], bot: () => "TonkfunBot", now: () => NOW,
      admins: fakeAdmins(), allowedBots: [], groupLang: "en", nameRisk: () => null, settings: (chat) => records.settings(chat),
      raid: { active: () => false, start: () => undefined, end: () => undefined }, press: () => true, owns: (chat) => chat === GROUP_ID,
    });
    await newcomers.tick(NOW);
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "kick")).toEqual([[GROUP_ID, 302]]);
  });
});
