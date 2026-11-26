import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deadlineFor, GRACE_MS, MAX_HELD_MS } from "../src/telegram/mod/newcomers-wait";
import { callsOf, GROUP_ID } from "./community-fixtures";
import { NOW } from "./fixtures";
import { MINUTE, person, SECOND, setup } from "./mod-newcomers-setup";

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/** The privacy page: a check's record is kept 15 minutes at most, 45 in all when posting it was delayed. */
describe("how long a newcomer waiting for a check is held", () => {
  it("never gives a posted check a deadline that would outlive 45 minutes from when it opened", () => {
    expect(deadlineFor(NOW, NOW + 5 * MINUTE, 10 * MINUTE)).toBe(NOW + 15 * MINUTE);
    expect(deadlineFor(NOW, NOW + 31 * MINUTE, 10 * MINUTE)).toBe(NOW + MAX_HELD_MS - GRACE_MS);
    expect(deadlineFor(NOW, NOW + 31 * MINUTE, 10 * MINUTE) + GRACE_MS).toBe(NOW + 45 * MINUTE);
  });

  it("never posts a check late, past its 30 minutes: a retry that lands after them hands the newcomer back, text only", async () => {
    let fails = true;
    const { out, records, newcomers, at, join } = setup({ strictness: "relaxed", out: { send: async () => (fails ? null : 7001) } });
    await join([person(201)], 71, NOW);
    for (let t = 15 * SECOND; t <= 29 * MINUTE + 45 * SECOND; t += 15 * SECOND) await newcomers.tick(at(NOW + t));
    await vi.advanceTimersByTimeAsync(0);
    const tried = callsOf(out.log, "send").length;
    fails = false;
    await newcomers.tick(at(NOW + 30 * MINUTE + 5 * SECOND));
    await vi.advanceTimersByTimeAsync(0);
    // No check goes out after its 30 minutes, so nothing is held past 45 in all.
    expect(callsOf(out.log, "send")).toHaveLength(tried);
    expect(records.pending(GROUP_ID, 201)).toBeNull();
    expect(records.isNewcomer(GROUP_ID, 201, NOW + 30 * MINUTE + 5 * SECOND)).toBe(true);
  });
});
