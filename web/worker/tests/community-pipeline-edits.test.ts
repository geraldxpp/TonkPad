// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TgMessage } from "../src/telegram/types";
import { callsOf, groupMessage, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";
import { DAY, GROUP_ID, harness, MINUTE, person, S, scripted, settle, verdict } from "./community-pipeline-fixtures";

const nowS = Math.floor(NOW / 1000);
const edit = (m: TgMessage, text: string, at: number): TgMessage => ({ ...m, text, edit_date: Math.floor(at / 1000) });

/** abuse#16: an edit Telegram held back while the worker was down is handled like a message from then. */
describe("the community pipeline: edits made while the worker was down", () => {
  it("deletes a certain hit only: no ban, mute, notice, alert or model call, then one summary", async () => {
    const h = harness();
    h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
    const m = groupMessage("hello everyone", { date: nowS - 900 });
    await h.community.pipeline.onEdited({ ...m, text: "Claim your airdrop at tonkfun-airdrop.xyz", edit_date: nowS - 600 });
    const unknown = groupMessage("hi", { date: nowS - 900, from: person(202) });
    await h.community.pipeline.onEdited({ ...unknown, text: "prices on coolcoin.xyz look good, how about yours?", edit_date: nowS - 600 });
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(h.out.log.filter((c) => ["restrict", "ban", "kick", "send"].includes(c.op))).toEqual([]);
    expect(h.alerts).toEqual([]);
    expect(h.calls).toHaveLength(0);
    await h.tick(NOW + 20 * S);
    expect(h.alerts.map((a) => a.kind)).toEqual(["action"]);
  });

  it("still moderates a fresh edit in full", async () => {
    const h = harness({ client: null });
    h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
    const m = groupMessage("hello everyone");
    await h.send(m);
    await h.community.pipeline.onEdited(edit(m, "Claim your airdrop at tonkfun-airdrop.xyz", NOW + 30 * S));
    await settle();
    expect(callsOf(h.out.log, "ban")).toEqual([[GROUP_ID, MEMBER.id]]);
  });
});

/** claude#2: edits can't spend a group's checks; rules#10: they never count as new messages, but more than 10 in 10 seconds flood. */
describe("the community pipeline: the check's pace", () => {
  it("checks an edit only when what it says changed, and at most once a minute per message", async () => {
    const h = harness({ client: scripted({ triage: verdict({ question: "none" }) }) });
    const m = groupMessage("how do the fees work on a launch?");
    await h.send(m);
    await settle();
    // The same words: nothing to check again.
    await h.community.pipeline.onEdited(edit(m, "How do the fees work on a launch?", NOW + 2 * S));
    // A change within the minute waits; after it, it is checked.
    await h.community.pipeline.onEdited(edit(m, "how do the fees work on a launch? asking for a friend", NOW + 4 * S));
    await settle();
    expect(h.kinds()).toEqual(["triage"]);
    h.clock.now = NOW + MINUTE + 5 * S;
    await h.community.pipeline.onEdited(edit(m, "how do the fees work on a launch? asking for a friend", NOW + MINUTE + 5 * S));
    await settle();
    expect(h.kinds()).toEqual(["triage", "triage"]);
  });

  it("gives one member at most 3 checks a minute, leaving the group's for everyone else", async () => {
    const h = harness({ client: scripted({ triage: verdict({ question: "none" }) }) });
    for (let i = 0; i < 6; i += 1) {
      h.clock.now = NOW + i * 2 * S;
      await h.send(groupMessage(`question number ${i + 1}: how do the fees work?`));
    }
    await h.send(groupMessage("and how do locks work?", { from: person(202) }));
    await settle();
    expect(h.kinds()).toEqual(["triage", "triage", "triage", "triage"]);
  });

  it("counts more than 10 edits in 10 seconds as a flood of their own (rules#10)", async () => {
    const h = harness({ client: null });
    const m = groupMessage("gm 0");
    await h.send(m);
    // 11 edits of one message, half a second apart: 5.5 seconds in all.
    for (let i = 1; i <= 11; i += 1) {
      h.clock.now = NOW + i * 500;
      await h.community.pipeline.onEdited(edit(m, `gm ${i}`, h.clock.now));
    }
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "restrict")).toEqual([[GROUP_ID, MEMBER.id, expect.any(Object), Math.floor(h.clock.now / 1000) + 600]]);
    expect(h.records.offences(GROUP_ID, MEMBER.id, h.clock.now)).toMatchObject({ n: 1, category: "flood" });
  });

  it("never counts an edit as a new message: 1 message and 7 edits in 3.5 seconds are no flood (rules#10)", async () => {
    const h = harness({ client: null });
    const m = groupMessage("gm 0");
    await h.send(m);
    for (let i = 1; i <= 7; i += 1) {
      h.clock.now = NOW + i * 500;
      await h.community.pipeline.onEdited(edit(m, `gm ${i}`, h.clock.now));
    }
    await settle();
    expect(h.removed()).toEqual([]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(h.records.offences(GROUP_ID, MEMBER.id, h.clock.now).n).toBe(0);
  });
});
