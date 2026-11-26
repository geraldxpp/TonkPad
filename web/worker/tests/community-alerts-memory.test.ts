import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlerts } from "../src/telegram/community/alerts";
import { createAlertGate } from "../src/telegram/community/index-gate";
import type { SendOptions } from "../src/telegram/community/out";
import { alertOf, setupAlerts as setup } from "./community-alerts-fixtures";
import { ADMIN_CHAT_ID, callsOf, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { MIN, NOW, SEC } from "./fixtures";

/**
 * Names and excerpts in the admin chat's batches stay in memory 10 minutes
 * at most, counted from when each alert was raised (newcomers#8,
 * admin-privacy-docs#2): a batch goes out by 9 minutes 30 seconds, leaving
 * its send time to wait in the admin chat's queue, and an alert that waited
 * at the gate brings its batch forward.
 */

const member = (id: number) => ({ id, name: `Member ${id}`, username: null, since: null });
const flushed = () => vi.advanceTimersByTimeAsync(0);

/** Alerts behind the admin chat's gate, waiting, on a clock the test moves with the fake timers. */
function gated() {
  let clock = NOW;
  const out = recordOut();
  const alerts = createAlerts({ out, records: memoryRecords(), adminChat: ADMIN_CHAT_ID, words: testWords, now: () => clock, groupTitle: () => "Group" });
  const gate = createAlertGate(alerts, () => clock, "wait");
  const sends = () => callsOf(out.log, "send").map(([, html, options]) => ({ html: html as string, options: options as SendOptions }));
  const later = async (ms: number) => {
    clock += ms;
    await vi.advanceTimersByTimeAsync(ms);
  };
  return { gate, sends, later };
}

describe("alert batches and the memory line", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("sends the digest 9 minutes 30 seconds after its first item, so its send fits inside 10 minutes", async () => {
    const { alerts, sends } = setup();
    alerts.alert(alertOf({ kind: "observe", member: member(1) }));
    await vi.advanceTimersByTimeAsync(9 * MIN + 29 * SEC);
    expect(sends()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(SEC);
    expect(sends()).toHaveLength(1);
    expect(sends()[0].html).toContain("Member 1");
  });

  it("sends a digest from the tick at 9 minutes 30 seconds too", async () => {
    const { alerts, sends } = setup();
    alerts.alert(alertOf({ kind: "observe", member: member(1) }));
    await alerts.tick(NOW + 9 * MIN + 29 * SEC);
    expect(sends()).toHaveLength(0);
    await alerts.tick(NOW + 9 * MIN + 30 * SEC);
    expect(sends()).toHaveLength(1);
  });

  it("counts a gated alert's time from when it was raised: opened 9 minutes later, the digest goes 30 seconds after", async () => {
    const { gate, sends, later } = gated();
    gate.alert(alertOf({ kind: "observe", member: member(1), excerpt: "a reported message" }));
    await later(9 * MIN);
    gate.open();
    await flushed();
    expect(sends()).toHaveLength(0);
    await later(29 * SEC);
    expect(sends()).toHaveLength(0);
    await later(SEC);
    expect(sends()).toHaveLength(1);
    expect(sends()[0].html).toContain("Member 1");
  });

  it("brings a digest that was already waiting forward for an older alert from the gate", async () => {
    const { gate, sends, later } = gated();
    gate.alert(alertOf({ kind: "observe", member: member(1) }));
    await later(8 * MIN);
    gate.open();
    // A new item after the opening would set the digest 9 minutes 30 seconds out; the gated one keeps it at its own time.
    gate.alert(alertOf({ kind: "observe", member: member(2) }));
    await later(90 * SEC);
    expect(sends()).toHaveLength(1);
    expect(sends()[0].html).toContain("Member 1");
    expect(sends()[0].html).toContain("Member 2");
  });

  it("counts a gated alert's time in a storm too: its summary goes 9 minutes 30 seconds after it was raised, not a minute after the opening", async () => {
    const { gate, sends, later } = gated();
    for (let id = 1; id <= 7; id += 1) gate.alert(alertOf({ undo: null, category: "lookalike", member: member(id) }));
    await later(9 * MIN);
    gate.open();
    await flushed();
    expect(sends()).toHaveLength(6);
    await later(29 * SEC);
    expect(sends()).toHaveLength(6);
    await later(SEC);
    expect(sends()).toHaveLength(7);
    expect(sends()[6].html).toContain("Member 7");
  });

  it("drops an alert that waited at the gate past 9 minutes 30 seconds: it could no longer go out inside 10 minutes", async () => {
    const { gate, sends, later } = gated();
    gate.alert(alertOf({ kind: "observe", member: member(1) }));
    gate.alert(alertOf({ kind: "lost_funds", category: "lost_funds", undo: null, routine: false, member: member(2) }));
    await later(9 * MIN + 31 * SEC);
    gate.open();
    await later(10 * MIN);
    expect(sends()).toEqual([]);
  });
});
