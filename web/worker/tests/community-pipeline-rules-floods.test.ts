// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TgMessage } from "../src/telegram/types";
import { callsOf, groupMessage, MEMBER } from "./community-fixtures";
import { NOW } from "./fixtures";
import { GROUP_ID, harness, person, S, settle } from "./community-pipeline-fixtures";

const nowS = Math.floor(NOW / 1000);
const edit = (m: TgMessage, text: string, at: number): TgMessage => ({ ...m, text, edit_date: Math.floor(at / 1000) });
const origin = { type: "hidden_user" as const, date: nowS - 3_600, sender_user_name: "Ad Channel" };

/** rules#6: a forward burst or an album counts one message for every 5, and a long burst floods however grouped. */
describe("the community pipeline: forward bursts and albums (rules#6)", () => {
  it("a member forwarding 21 ads at once, three times 10 seconds apart, is muted and every forward deleted", async () => {
    const h = harness({ client: null });
    const sent: TgMessage[] = [];
    for (const sec of [0, 10, 21]) {
      h.clock.now = NOW + sec * S;
      for (let i = 0; i < 21; i++) {
        const m = groupMessage(`ad ${sec}-${i}`, { forward_origin: origin, date: nowS + sec });
        sent.push(m);
        await h.send(m);
      }
    }
    await settle();
    expect(callsOf(h.out.log, "restrict").length).toBeGreaterThan(0);
    // The whole first burst goes: the flood's own and the rest as it arrives.
    for (const m of sent.slice(0, 21)) expect(h.removed()).toContain(m.message_id);
    expect(h.records.offences(GROUP_ID, MEMBER.id, h.clock.now)).toMatchObject({ category: "flood" });
  });

  it("two 10-photo albums every 10 seconds flood", async () => {
    const h = harness({ client: null });
    for (const [a, sec] of [0, 5, 10, 16].entries()) {
      h.clock.now = NOW + sec * S;
      for (let i = 0; i < 10; i++) await h.send(groupMessage("", { photo: [{ file_id: `p${a}${i}`, file_unique_id: `u${a}${i}`, width: 1, height: 1 }], media_group_id: `album${a}`, date: nowS + sec }));
    }
    await settle();
    expect(callsOf(h.out.log, "restrict").length).toBeGreaterThan(0);
  });

  it("one album of 8 screenshots, or 9 forwards at once, is no flood", async () => {
    const h = harness({ client: null });
    for (let i = 0; i < 8; i++) await h.send(groupMessage("", { photo: [{ file_id: `s${i}`, file_unique_id: `v${i}`, width: 1, height: 1 }], media_group_id: "shots" }));
    for (let i = 0; i < 9; i++) await h.send(groupMessage(`fw ${i}`, { forward_origin: origin, from: person(202) }));
    await settle();
    expect(h.removed()).toEqual([]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
  });
});

/** rules#10 and answers#3: fixing typos never floods. */
describe("the community pipeline: edits never count as new messages (rules#10)", () => {
  it("strict: three messages and three typo fixes in 7 seconds remove nothing and record nothing", async () => {
    const h = harness({ client: null, mode: "strict" });
    const texts = ["gm", "chart looks good", "wen listing"];
    const sent = texts.map((text) => groupMessage(text));
    for (const [i, m] of sent.entries()) {
      h.clock.now = NOW + i * S;
      await h.send(m);
    }
    for (const [i, m] of sent.entries()) {
      h.clock.now = NOW + (4 + i) * S;
      await h.community.pipeline.onEdited(edit(m, `${m.text}?`, h.clock.now));
    }
    await settle();
    expect(h.removed()).toEqual([]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(h.records.offences(GROUP_ID, MEMBER.id, h.clock.now).n).toBe(0);
  });

  it("normal: four messages and four typo fixes are no flood either", async () => {
    const h = harness({ client: null });
    const sent = ["hi all", "when is the next launch", "is the curve full yet", "lfg"].map((text) => groupMessage(text));
    for (const [i, m] of sent.entries()) {
      h.clock.now = NOW + i * S;
      await h.send(m);
    }
    for (const [i, m] of sent.entries()) {
      h.clock.now = NOW + 5 * S + i * 500;
      await h.community.pipeline.onEdited(edit(m, `${m.text}?`, h.clock.now));
    }
    await settle();
    expect(h.removed()).toEqual([]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
  });

  it("more than 10 edits in 10 seconds is a flood of its own", async () => {
    const h = harness({ client: null });
    const m = groupMessage("gm 0");
    await h.send(m);
    for (let i = 1; i <= 11; i += 1) {
      h.clock.now = NOW + i * 500;
      await h.community.pipeline.onEdited(edit(m, `gm ${i}`, h.clock.now));
    }
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "restrict")).toHaveLength(1);
    expect(h.records.offences(GROUP_ID, MEMBER.id, h.clock.now)).toMatchObject({ n: 1, category: "flood" });
  });
});

/** rules#12: until getChat has answered for a group, a member tag is the admins' word. */
describe("the community pipeline: member tags before getChat answers (rules#12)", () => {
  it("never mutes a helper whose admin-set tag is Mod while getChat hasn't answered", async () => {
    const h = harness({ client: null, out: { chat: () => new Promise(() => undefined) } });
    await h.send(groupMessage("happy to help with launches", { sender_tag: "Mod" }));
    await settle();
    expect(h.removed()).toEqual([]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
  });

  it("reads the tag once getChat says members may edit their own", async () => {
    const h = harness({ client: null, out: { chat: async (chat) => ({ id: chat, type: "supergroup", title: "Group", permissions: { can_edit_tag: true } }) } });
    await h.send(groupMessage("gm", { sender_tag: "Mod", from: person(303) }));
    await settle();
    h.clock.now = NOW + 2 * S;
    await h.send(groupMessage("gm again", { sender_tag: "Mod", from: person(303) }));
    await settle();
    expect(callsOf(h.out.log, "restrict").map((c) => c[1])).toEqual([303]);
  });
});
