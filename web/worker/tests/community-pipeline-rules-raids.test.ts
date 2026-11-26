// @vitest-environment node
import { describe, expect, it } from "vitest";
import { callsOf, groupMessage } from "./community-fixtures";
import { NOW } from "./fixtures";
import { DAY, GROUP_ID, harness, person, S, settle } from "./community-pipeline-fixtures";

const newcomers = (h: ReturnType<typeof harness>, list: readonly number[]) => {
  for (const id of list) h.records.markNewcomer(GROUP_ID, id, NOW - 60_000, NOW + DAY);
};
const bans = (h: ReturnType<typeof harness>) => callsOf(h.out.log, "ban").map((c) => c[1] as number).sort();

/** rules#4: a raid can never be aimed at a member or a newcomer. */
describe("the community pipeline: who a link raid punishes (rules#4)", () => {
  it("framing: a newcomer's chart, then two members' copies within 30 seconds, bans nobody", async () => {
    const h = harness({ client: null });
    newcomers(h, [741]);
    const chart = "this is the chart https://dexscreener.com/solana/abc123";
    const first = groupMessage(chart, { from: person(741) });
    await h.send(first);
    for (const [i, id] of [948, 949].entries()) {
      h.clock.now = NOW + (20 + i * 5) * S;
      await h.send(groupMessage(chart, { from: person(id) }));
    }
    await settle();
    expect(bans(h)).toEqual([]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    // The members only lose their copies; the newcomer's note is the newcomer rule's own, never a certain offence.
    for (const id of [948, 949]) expect(h.records.offences(GROUP_ID, id, h.clock.now).n).toBe(0);
    expect(h.records.offences(GROUP_ID, 741, h.clock.now).certain).toBe(0);
    // The newcomer's chart goes with the gentle note, as the newcomer rule says; raid mode starts.
    expect(h.removed()).toContain(first.message_id);
    expect(h.sends().some((s) => s[1].includes("new members can't post links yet"))).toBe(true);
    expect(h.alerts.filter((a) => a.category === "link_raid")).toEqual([]);
    expect(h.records.settings(GROUP_ID).raidUntil).toBeGreaterThan(NOW);
  });

  it("framing with a severe link: two older accounts' copies never make a newcomer a raider", async () => {
    const h = harness({ client: null });
    newcomers(h, [751]);
    for (const id of [751, 958, 959]) await h.send(groupMessage("vip calls here t.me/+VipCalls123", { from: person(id) }));
    await settle();
    expect(bans(h)).toEqual([]);
    expect(h.alerts.filter((a) => a.category === "link_raid")).toEqual([]);
  });

  it("launch day: three newcomers share one KOL tweet within a minute; nobody is banned", async () => {
    const h = harness({ client: null });
    newcomers(h, [751, 752, 753]);
    const tweet = "huge call https://x.com/blknoiz06/status/1861234567890";
    for (const [i, id] of [751, 752, 753].entries()) {
      h.clock.now = NOW + i * 20 * S;
      await h.send(groupMessage(tweet, { from: person(id) }));
    }
    await settle();
    expect(bans(h)).toEqual([]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(h.alerts.filter((a) => a.category === "link_raid")).toEqual([]);
    expect(h.records.settings(GROUP_ID).raidUntil).toBeGreaterThan(NOW);
  });

  it("three new accounts raiding with a look-alike are each banned, by the rule and the raid alike", async () => {
    const h = harness({ client: null });
    newcomers(h, [761, 762, 763]);
    for (const id of [761, 762, 763]) await h.send(groupMessage("Claim your TONK airdrop at tonkfun-airdrop.xyz/claim", { from: person(id) }));
    await settle();
    expect([...new Set(bans(h))]).toEqual([761, 762, 763]);
  });
});

/** rules#5: report words never waive bait, a claim or an endorsement, so such copies are raiders. */
describe("the community pipeline: an endorsed scam raid (rules#5)", () => {
  it("five new accounts posting '100% legit, claim your TONK airdrop…' are banned, and no scam report reaches the team", async () => {
    const h = harness({ client: null });
    const raiders = [801, 802, 803, 804, 805];
    newcomers(h, raiders);
    for (const [i, id] of raiders.entries()) {
      h.clock.now = NOW + i * 5 * S;
      await h.send(groupMessage("100% legit, claim your TONK airdrop at tonkfun-airdrop.xyz/claim", { from: person(id) }));
    }
    await settle();
    expect([...new Set(bans(h))]).toEqual(raiders);
    expect(h.alerts.filter((a) => a.kind === "scam_report")).toEqual([]);
    expect(h.sends().filter((s) => s[1].includes("That account isn't us"))).toEqual([]);
  });
});
