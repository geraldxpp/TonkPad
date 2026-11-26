import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertOf, setupAlerts as setup } from "./community-alerts-fixtures";
import { MIN, NOW, SEC } from "./fixtures";

/**
 * The storm's summary and the digest go out at their due time by
 * themselves, whatever the tick does (privacy#5): a tick held up by a raid
 * can't keep names and excerpts in memory past their time.
 */

const member = (id: number) => ({ id, name: `Member ${id}`, username: null, since: null });
/** Lets the sends a timer starts finish. */
const flushed = () => vi.advanceTimersByTimeAsync(0);

describe("alert batches without a tick", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("send a storm's summary a minute after it began", async () => {
    const { alerts, sends } = setup();
    // Nothing to undo: an alert with an Undo keeps its own message in a storm (community-alerts-storm.test.ts).
    for (let id = 1; id <= 8; id += 1) alerts.alert(alertOf({ member: member(id), undo: null, category: "lookalike" }));
    await flushed();
    expect(sends()).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(59 * SEC);
    expect(sends()).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(SEC);
    expect(sends()).toHaveLength(7);
    expect(sends()[6].html.split("\n")[0]).toBe("<b>Alert: digest</b> · 2");
  });

  it("send the digest 9 minutes 30 seconds after its first item", async () => {
    const { alerts, sends } = setup();
    alerts.alert(alertOf({ kind: "observe", member: member(1) }));
    await vi.advanceTimersByTimeAsync(9 * MIN);
    expect(sends()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(MIN);
    expect(sends()).toHaveLength(1);
    expect(sends()[0].html).toContain("Member 1");
  });

  it("go once: a tick that already sent a batch leaves its timer nothing to send, and the next batch keeps its own time", async () => {
    const { alerts, sends, at } = setup();
    alerts.alert(alertOf({ kind: "observe", member: member(1) }));
    at(NOW + 10 * MIN);
    await alerts.tick(NOW + 10 * MIN);
    await flushed();
    expect(sends()).toHaveLength(1);
    // A new item 5 minutes later starts the next digest; the first one's timer must not send it early.
    await vi.advanceTimersByTimeAsync(5 * MIN);
    at(NOW + 15 * MIN);
    alerts.alert(alertOf({ kind: "observe", member: member(2) }));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(sends()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(sends()).toHaveLength(2);
  });
});
