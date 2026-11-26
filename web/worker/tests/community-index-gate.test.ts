import { describe, expect, it, vi } from "vitest";
import { createAlerts } from "../src/telegram/community/alerts";
import { createAlertGate } from "../src/telegram/community/index-gate";
import type { AdminAlert } from "../src/telegram/community/types";
import { alertOf } from "./community-alerts-fixtures";
import { ADMIN_CHAT_ID, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { MIN, NOW } from "./fixtures";

/** A sink that notes what reaches it, with a prune of its own. */
function noting() {
  const sent: AdminAlert[] = [];
  const prune = vi.fn<(now: number) => void>();
  const tick = vi.fn<(now: number) => Promise<void>>(async () => undefined);
  return { sink: { alert: (a: AdminAlert) => void sent.push(a), tick, prune }, sent, prune, tick };
}

/** The admin chat's alert gate: what it holds, and the sink's own memory, go within 10 minutes. */
describe("createAlertGate", () => {
  it("forgets an alert that waited 10 minutes, and lets the sink forget what it keeps, in every state", () => {
    let clock = NOW;
    const s = noting();
    const gate = createAlertGate(s.sink, () => clock, "wait");
    gate.alert(alertOf({ member: { id: 1, name: "Old", username: null, since: null } }));
    clock = NOW + 9 * MIN;
    gate.alert(alertOf({ member: { id: 2, name: "New", username: null, since: null } }));
    gate.prune(NOW + 10 * MIN);
    expect(s.prune).toHaveBeenLastCalledWith(NOW + 10 * MIN);
    gate.open();
    expect(s.sent.map((a) => a.member?.name)).toEqual(["New"]);
    gate.prune(NOW + 11 * MIN);
    gate.shut();
    gate.prune(NOW + 12 * MIN);
    expect(s.prune.mock.calls).toEqual([[NOW + 10 * MIN], [NOW + 11 * MIN], [NOW + 12 * MIN]]);
  });

  it("passes ticks on only while open, and prunes a sink without a prune of its own", async () => {
    const s = noting();
    const gate = createAlertGate(s.sink, () => NOW, "wait");
    await gate.tick(NOW);
    expect(s.tick).not.toHaveBeenCalled();
    gate.open();
    await gate.tick(NOW);
    expect(s.tick).toHaveBeenCalledWith(NOW);
    const bare = createAlertGate({ alert: () => undefined, tick: async () => undefined }, () => NOW, "open");
    expect(() => bare.prune(NOW)).not.toThrow();
  });

  it("reaches the real alerts' prune, which forgets their repeat keys", () => {
    const alerts = createAlerts({ out: recordOut(), records: memoryRecords(), adminChat: ADMIN_CHAT_ID, words: testWords, now: () => NOW, groupTitle: () => "Group" });
    const prune = vi.spyOn(alerts, "prune");
    const gate = createAlertGate(alerts, () => NOW, "open");
    gate.prune(NOW + 10 * MIN);
    expect(prune).toHaveBeenCalledWith(NOW + 10 * MIN);
  });
});
