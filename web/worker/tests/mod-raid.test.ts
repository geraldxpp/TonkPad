import { describe, expect, it } from "vitest";
import type { AdminAlert, Strictness } from "../src/telegram/community/types";
import { createRaidWatch, RAID_MS } from "../src/telegram/mod/raid";
import { callsOf, GROUP_ID, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(strictness: Strictness = "normal") {
  const out = recordOut();
  const records = memoryRecords({ strictness });
  const alerts: AdminAlert[] = [];
  const raid = createRaidWatch({
    out, records, words: () => testWords, alerts: { alert: (a) => void alerts.push(a) }, recentIds: () => [], bot: () => "TonkfunBot", now: () => NOW,
    groupLang: "en", settings: (chat) => records.settings(chat), update: (chat, patch) => records.updateSettings(chat, patch), chats: [GROUP_ID],
  });
  const notices = () => callsOf(out.log, "send").map((c) => c[1]);
  return { out, records, alerts, raid, notices };
}

describe("raid mode", () => {
  it("starts when 10 people join within a minute, not when the joins are spread out", async () => {
    const spread = setup();
    for (let i = 0; i < 12; i += 1) spread.raid.noteJoin(GROUP_ID, NOW + i * 7 * SECOND);
    expect(spread.raid.active(GROUP_ID, NOW + 90 * SECOND)).toBe(false);

    const { raid, alerts, notices } = setup();
    for (let i = 0; i < 9; i += 1) raid.noteJoin(GROUP_ID, NOW + i * SECOND);
    expect(raid.active(GROUP_ID, NOW + 9 * SECOND)).toBe(false);
    raid.noteJoin(GROUP_ID, NOW + 9 * SECOND);
    expect(raid.active(GROUP_ID, NOW + 10 * SECOND)).toBe(true);
    await flush();
    expect(notices()).toEqual(["Raid protection is on."]);
    expect(alerts).toEqual([expect.objectContaining({ kind: "raid", chat: GROUP_ID, member: null, excerpt: null, routine: true, done: "Raid protection is on." })]);
  });

  it("starts when the rules act 8 times within a minute", () => {
    const { raid } = setup();
    for (let i = 0; i < 7; i += 1) raid.noteAction(GROUP_ID, NOW + i * SECOND);
    expect(raid.active(GROUP_ID, NOW + 8 * SECOND)).toBe(false);
    raid.noteAction(GROUP_ID, NOW + 8 * SECOND);
    expect(raid.active(GROUP_ID, NOW + 9 * SECOND)).toBe(true);
  });

  it("starts at once on a link raid or a text raid", () => {
    for (const kind of ["link", "text"] as const) {
      const { raid, records } = setup();
      raid.noteRaid(GROUP_ID, kind, NOW);
      expect(raid.active(GROUP_ID, NOW + SECOND)).toBe(true);
      expect(records.settings(GROUP_ID).raidUntil).toBe(NOW + RAID_MS);
    }
  });

  it("sends its notice and alert once while it lasts, extended by new signals", async () => {
    const { raid, alerts, notices, records } = setup();
    raid.noteRaid(GROUP_ID, "link", NOW);
    raid.noteRaid(GROUP_ID, "text", NOW + 20 * MINUTE);
    for (let i = 0; i < 12; i += 1) raid.noteJoin(GROUP_ID, NOW + 20 * MINUTE + i * SECOND);
    raid.start(GROUP_ID, "admin", NOW + 21 * MINUTE);
    await flush();
    expect(records.settings(GROUP_ID).raidUntil).toBe(NOW + 21 * MINUTE + RAID_MS);
    await raid.tick(NOW + 31 * MINUTE);
    expect(raid.active(GROUP_ID, NOW + 31 * MINUTE)).toBe(true);
    // A signal just past its time, before the tick ends it, carries it on.
    raid.noteRaid(GROUP_ID, "link", NOW + 52 * MINUTE);
    expect(records.settings(GROUP_ID).raidUntil).toBe(NOW + 52 * MINUTE + RAID_MS);
    await flush();
    expect(notices()).toEqual(["Raid protection is on."]);
    expect(alerts).toHaveLength(1);
  });

  it("ends after 30 quiet minutes with one notice and one alert, removing the start notice", async () => {
    const { raid, alerts, notices, out } = setup();
    raid.noteRaid(GROUP_ID, "link", NOW);
    await flush();
    await raid.tick(NOW + 29 * MINUTE);
    expect(raid.active(GROUP_ID, NOW + 29 * MINUTE)).toBe(true);
    await raid.tick(NOW + 30 * MINUTE);
    await raid.tick(NOW + 31 * MINUTE);
    expect(raid.active(GROUP_ID, NOW + 30 * MINUTE)).toBe(false);
    expect(notices()).toEqual(["Raid protection is on.", "Raid protection is off."]);
    expect(alerts.map((a) => a.done)).toEqual(["Raid protection is on.", "Raid protection is off."]);
    expect(callsOf(out.log, "remove")).toEqual([[GROUP_ID, [5001]]]);
    expect(callsOf(out.log, "removeLater").at(-1)).toEqual([GROUP_ID, 5002, 60_000]);
  });

  it("ends when an admin ends it, and a raid saved before a restart still ends on time", async () => {
    const { raid, notices } = setup();
    raid.start(GROUP_ID, "admin", NOW);
    raid.end(GROUP_ID, NOW + MINUTE);
    await flush();
    expect(raid.active(GROUP_ID, NOW + MINUTE)).toBe(false);
    expect(notices()).toEqual(["Raid protection is on.", "Raid protection is off."]);

    const restarted = setup();
    restarted.records.updateSettings(GROUP_ID, { raidUntil: NOW + 10 * MINUTE });
    await restarted.raid.tick(NOW + 11 * MINUTE);
    expect(restarted.records.settings(GROUP_ID).raidUntil).toBe(0);
    expect(restarted.alerts.map((a) => a.done)).toEqual(["Raid protection is off."]);
  });

  it("sums up the removed messages every 5 minutes instead of one notice each", async () => {
    const { raid, records, notices, out } = setup();
    raid.noteRaid(GROUP_ID, "link", NOW);
    records.count(GROUP_ID, "removed", NOW, 4);
    await raid.tick(NOW + 4 * MINUTE);
    expect(notices()).toHaveLength(1);
    await raid.tick(NOW + 5 * MINUTE);
    expect(notices().at(-1)).toBe("Messages removed in the last minutes: 4");
    expect(callsOf(out.log, "removeLater").at(-1)).toEqual([GROUP_ID, 5002, 60_000]);
    await raid.tick(NOW + 10 * MINUTE);
    expect(notices()).toHaveLength(2);
  });

  it("ends a raid quietly in a group the agent stops running: no notice, no alert, no summary, and nothing starts it again", async () => {
    const { raid, records, alerts, notices, out } = setup();
    raid.noteRaid(GROUP_ID, "link", NOW);
    records.count(GROUP_ID, "removed", NOW, 4);
    await flush();
    raid.dropChat(GROUP_ID);
    expect(raid.active(GROUP_ID, NOW + MINUTE)).toBe(false);
    expect(records.settings(GROUP_ID).raidUntil).toBe(0);
    // Its "on" notice goes with it.
    expect(callsOf(out.log, "remove")).toEqual([[GROUP_ID, [5001]]]);
    await raid.tick(NOW + 5 * MINUTE);
    await raid.tick(NOW + 31 * MINUTE);
    for (let i = 0; i < 12; i += 1) raid.noteJoin(GROUP_ID, NOW + 32 * MINUTE + i * SECOND);
    raid.noteRaid(GROUP_ID, "text", NOW + 33 * MINUTE);
    await flush();
    expect(raid.active(GROUP_ID, NOW + 33 * MINUTE)).toBe(false);
    expect(notices()).toEqual(["Raid protection is on."]);
    expect(alerts.map((a) => a.done)).toEqual(["Raid protection is on."]);
  });

  it("in observe mode tells only the admins", async () => {
    const { raid, alerts, notices } = setup("observe");
    raid.noteRaid(GROUP_ID, "text", NOW);
    await flush();
    expect(raid.active(GROUP_ID, NOW)).toBe(true);
    expect(notices()).toEqual([]);
    expect(alerts).toHaveLength(1);
  });
});
