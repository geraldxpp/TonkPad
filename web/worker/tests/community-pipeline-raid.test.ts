// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nameHash } from "../src/telegram/mod/names";
import { callsOf, groupMessage, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";
import { DAY, GROUP_ID, harness, HOUR, person, S, settle } from "./community-pipeline-fixtures";

/** The same link to a site not on the allow-list, as a raid posts it: a plain unknown link, and one with a hidden dot (a severe kind). */
const LINK = "big gains today coolcoin.xyz/pump";
const SEVERE = "big gains today coolcoin[.]xyz/pump";

const raidAlerts = (h: ReturnType<typeof harness>) => h.alerts.filter((a) => a.kind === "action" && a.category === "link_raid");
const ids = (list: ReadonlyArray<{ member: { id: number | null } | null }>) => list.map((a) => a.member?.id ?? null).sort();
const newcomers = (h: ReturnType<typeof harness>, list: readonly number[]) => {
  for (const id of list) h.records.markNewcomer(GROUP_ID, id, NOW - 60_000, NOW + DAY);
};

/** A link raid's copies: who is punished, who only loses the copy, and that the team sees every account (rules#4: only new members' severe copies make raiders). */
describe("the community pipeline: link raids", () => {
  it("bans every new member who posts the raided severe link, each in an alert of their own that offers Unban", async () => {
    const h = harness({ client: null });
    newcomers(h, [401, 402, 403]);
    for (const [i, id] of [401, 402, 403].entries()) {
      h.clock.now = NOW + i * 10 * S;
      await h.send(groupMessage(SEVERE, { from: person(id) }));
    }
    await settle();
    expect(callsOf(h.out.log, "ban").map((c) => c[1]).sort()).toEqual([401, 402, 403]);
    const bans = raidAlerts(h).filter((a) => a.undo === "ban");
    expect(ids(bans)).toEqual([401, 402, 403]);
    expect(bans.every((a) => a.routine)).toBe(true);
    expect(h.records.settings(GROUP_ID).raidUntil).toBeGreaterThan(NOW);
  });

  it("bans nobody for a plain unknown link: each copy gets the newcomer note, and raid mode starts", async () => {
    const h = harness({ client: null });
    newcomers(h, [411, 412, 413]);
    const copies = [411, 412, 413].map((id) => groupMessage(LINK, { from: person(id) }));
    for (const m of copies) await h.send(m);
    await settle();
    expect(callsOf(h.out.log, "ban")).toEqual([]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(new Set(h.removed())).toEqual(new Set(copies.map((m) => m.message_id)));
    expect(raidAlerts(h)).toEqual([]);
    expect(h.records.settings(GROUP_ID).raidUntil).toBeGreaterThan(NOW);
  });

  it("only deletes members' copies: no mute, ban or offence, and each member is named to the team", async () => {
    const h = harness({ client: null });
    for (const text of [LINK, SEVERE]) {
      const copies = [301, 302, 303].map((id) => groupMessage(text, { from: person(id) }));
      for (const m of copies) await h.send(m);
      await settle();
      for (const m of copies) expect(h.removed()).toContain(m.message_id);
    }
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(callsOf(h.out.log, "ban")).toEqual([]);
    for (const id of [301, 302, 303]) expect(h.records.offences(GROUP_ID, id, NOW).n).toBe(0);
    expect(raidAlerts(h)).toEqual([]);
    expect(ids(h.alerts.filter((a) => a.category === "unknown_link"))).toEqual([301, 301, 302, 302, 303, 303]);
    expect(h.records.settings(GROUP_ID).raidUntil).toBeGreaterThan(NOW);
  });

  it("can't be aimed at a trusted member, nor make two newcomers raiders", async () => {
    const h = harness({ client: null });
    h.records.trust(GROUP_ID, 201, nameHash("Member201"), NOW - DAY);
    newcomers(h, [902, 903]);
    const trusted = groupMessage(SEVERE, { from: person(201) });
    await h.send(trusted);
    for (const id of [902, 903]) await h.send(groupMessage(SEVERE, { from: person(id) }));
    await settle();
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(callsOf(h.out.log, "ban")).toEqual([]);
    expect(h.records.offences(GROUP_ID, 201, NOW).n).toBe(0);
    expect(h.removed()).not.toContain(trusted.message_id);
    expect(raidAlerts(h)).toEqual([]);
    expect(h.records.settings(GROUP_ID).raidUntil).toBeGreaterThan(NOW);
  });

  it("never punishes a report of the raided link as a raider, nor counts it toward the three, though it counts toward raid mode", async () => {
    const h = harness({ client: null });
    newcomers(h, [501, 502, 503, 504]);
    for (const id of [501, 502]) await h.send(groupMessage(SEVERE, { from: person(id) }));
    const report = groupMessage("scam! don't click coolcoin[.]xyz/pump, they DMed me", { from: person(503) });
    await h.send(report);
    await settle();
    expect(h.records.settings(GROUP_ID).raidUntil).toBeGreaterThan(NOW);
    expect(callsOf(h.out.log, "ban")).toEqual([]);
    await h.send(groupMessage(SEVERE, { from: person(504) }));
    await settle();
    expect(callsOf(h.out.log, "ban").map((c) => c[1]).sort()).toEqual([501, 502, 504]);
    // The reporter's link is a new member's, removed with the newcomer note: never a raider's ban.
    expect(ids(raidAlerts(h))).toEqual([501, 502, 504]);
    expect(h.removed()).toContain(report.message_id);
  });

  it("removes a raider's own earlier copies with the one that started the raid", async () => {
    const h = harness({ client: null });
    newcomers(h, [601, 602, 603]);
    const copies = [601, 601, 602, 603].map((id) => groupMessage(SEVERE, { from: person(id) }));
    for (const m of copies) await h.send(m);
    await settle();
    expect(new Set(h.removed())).toEqual(new Set(copies.map((m) => m.message_id)));
    expect(callsOf(h.out.log, "ban").map((c) => c[1]).sort()).toEqual([601, 602, 603]);
  });

  it("is never started by members sharing a token address, a handle or a /check command", async () => {
    const h = harness({ client: null });
    const texts = ["aped 0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95", "0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95 chart looks good", "gm @alice_doe", "/check 0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95"];
    for (const text of texts) for (const id of [701, 702, 703]) await h.send(groupMessage(text, { from: person(id) }));
    await settle();
    expect(h.records.settings(GROUP_ID).raidUntil).toBe(0);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(callsOf(h.out.log, "ban")).toEqual([]);
    expect(h.removed()).toEqual([]);
  });

  it("counts the same Telegram link from three accounts by its raid key, though its link key is a handle", async () => {
    const h = harness({ client: null });
    const copies = [311, 312, 313].map((id) => groupMessage("join t.me/pump_signals_x for calls", { from: person(id) }));
    for (const m of copies) await h.send(m);
    await settle();
    expect(h.records.settings(GROUP_ID).raidUntil).toBeGreaterThan(NOW);
    // Members' copies: raid mode only, each removed by the unknown-link rule.
    expect(raidAlerts(h)).toEqual([]);
    expect(new Set(h.removed())).toEqual(new Set(copies.map((m) => m.message_id)));
  });

  it("lets only report words, never a question, keep a raider from being one", async () => {
    const h = harness({ client: null });
    newcomers(h, [321, 322, 323]);
    for (const id of [321, 322, 323]) await h.send(groupMessage("who wants big gains today? coolcoin[.]xyz/pump", { from: person(id) }));
    await settle();
    expect(h.records.settings(GROUP_ID).raidUntil).toBeGreaterThan(NOW);
    expect(callsOf(h.out.log, "ban").map((c) => c[1]).sort()).toEqual([321, 322, 323]);
  });

  it("turns raid mode on when every copy is a report, punishing nobody", async () => {
    const h = harness({ client: null });
    for (const id of [331, 332, 333]) await h.send(groupMessage("scam! don't click coolcoin.xyz/pump, they DMed me", { from: person(id) }));
    await settle();
    expect(h.records.settings(GROUP_ID).raidUntil).toBeGreaterThan(NOW);
    expect(raidAlerts(h)).toEqual([]);
    expect(h.out.log.filter((c) => ["restrict", "ban"].includes(c.op))).toEqual([]);
  });

  it("names when a newcomer joined in the admins' alert", async () => {
    const h = harness({ client: null });
    const joined = NOW - 3 * HOUR;
    h.records.markNewcomer(GROUP_ID, MEMBER.id, joined, NOW + DAY);
    await h.send(groupMessage("Claim your airdrop now at tonkfun-airdrop.xyz"));
    await settle();
    expect(h.alerts.map((a) => [a.kind, a.member?.since])).toEqual([["action", joined]]);
  });
});
