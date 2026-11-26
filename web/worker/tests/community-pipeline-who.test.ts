// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { CommunityOut } from "../src/telegram/community/out";
import { createWho } from "../src/telegram/community/pipeline-who";
import type { TgChatMember, TgMessage } from "../src/telegram/types";
import { actionsOf, adminInfo, callsOf, fakeAdmins, GROUP, groupMessage, memoryRecords, recordOut } from "./community-fixtures";
import { NOW } from "./fixtures";
import { ADMIN_ID, GROUP_ID, harness, person, SEED, scripted, settle, verdict } from "./community-pipeline-fixtures";

const TITLED = 901;
/** A helper promoted with no rights, for a custom title only. */
const titled = () => harness({ admins: [adminInfo(ADMIN_ID), adminInfo(TITLED, { canDelete: false, canRestrict: false })], client: scripted({ triage: verdict({ verdict: "scam", category: "phishing", question: "none" }) }) });

/** abuse#11: an administrator with a title only is moderated as a trusted member; real admins never are. */
describe("the community pipeline: administrators with a title only", () => {
  it("removes their recovery phrase, look-alike link and fake support", async () => {
    const h = titled();
    const messages = [SEED, "everyone go to tonkfun-claim.xyz", "DM me for support, I'll fix your wallet"].map((text) => groupMessage(text, { from: person(TITLED) }));
    for (const m of messages) await h.send(m);
    await settle();
    expect(new Set(h.removed())).toEqual(new Set(messages.map((m) => m.message_id)));
    expect(h.alerts.map((a) => a.category).sort()).toEqual(["fake_support", "lookalike", "secret"]);
  });

  it("sends their question to Haiku's check, whose scam verdict deletes it", async () => {
    const h = titled();
    const m = groupMessage("anyone want 2x? send 0.1 ETH to 0x2222222222222222222222222222222222222222", { from: person(TITLED) });
    await h.send(m);
    await settle();
    expect(h.kinds()).toEqual(["triage"]);
    expect(h.removed()).toEqual([m.message_id]);
  });

  it("never moderates an admin with either right, or the creator", async () => {
    for (const admin of [adminInfo(TITLED, { canDelete: false }), adminInfo(TITLED, { canRestrict: false }), adminInfo(TITLED, { creator: true, canDelete: false, canRestrict: false })]) {
      const h = harness({ admins: [admin], client: scripted({ triage: verdict({ verdict: "scam" }) }) });
      await h.send(groupMessage("everyone go to tonkfun-claim.xyz, is it live?", { from: person(TITLED) }));
      await settle();
      expect(actionsOf(h.out.log)).toEqual([]);
      expect(h.calls).toHaveLength(0);
    }
  });

  it("counts them as trusted for a raid's earlier copies too", async () => {
    const records = memoryRecords();
    const admins = fakeAdmins({ [GROUP_ID]: [adminInfo(ADMIN_ID), adminInfo(TITLED, { canDelete: false, canRestrict: false })] });
    const who = createWho({ out: recordOut(), records, admins, teamChat: () => false, discussion: () => false, groupLang: "en", strictness: () => "normal" });
    expect(who.standing(GROUP_ID, TITLED, NOW)).toBe("trusted");
    expect(who.standing(GROUP_ID, ADMIN_ID, NOW)).toBe("admin");
    expect(await who.of(groupMessage("hi", { from: person(TITLED) }), NOW)).toMatchObject({ standing: "trusted", titled: true, trustedName: true });
  });
});

/** robustness#9: a commenter on a channel post is new until Telegram really says they joined. */
describe("who wrote it: commenters on a channel post", () => {
  const post = { message_id: 50, date: Math.floor(NOW / 1000), chat: GROUP, is_automatic_forward: true };
  const comment = (): TgMessage => groupMessage("nice post", { from: person(406), reply_to_message: post, message_thread_id: 50 });

  function setup(member: CommunityOut["member"]) {
    const out = recordOut({ member });
    const records = memoryRecords();
    const who = createWho({ out, records, admins: fakeAdmins({ [GROUP_ID]: [] }), teamChat: () => false, discussion: () => true, groupLang: "en", strictness: () => "normal" });
    return { out, records, who };
  }

  it("counts a commenter as new for one message when Telegram fails, keeps nothing, and asks again next time", async () => {
    const answers: Array<TgChatMember | null> = [null, { status: "member", user: { id: 406 } }];
    const s = setup(async () => answers.shift() ?? null);
    expect(await s.who.of(comment(), NOW)).toMatchObject({ standing: "new" });
    expect(s.records.isNewcomer(GROUP_ID, 406, NOW)).toBe(false);
    expect(await s.who.of(comment(), NOW + 1_000)).toMatchObject({ standing: "member" });
    // A real answer is kept for 10 minutes.
    expect(await s.who.of(comment(), NOW + 2_000)).toMatchObject({ standing: "member" });
    expect(callsOf(s.out.log, "member")).toHaveLength(2);
  });

  it("counts a commenter as new when Telegram takes over 3 seconds, and reads its late answer next time", async () => {
    vi.useFakeTimers();
    try {
      const s = setup(() => new Promise((resolve) => setTimeout(() => resolve({ status: "left", user: { id: 406 } }), 5_000)));
      const first = s.who.of(comment(), NOW);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await first).toMatchObject({ standing: "new" });
      expect(s.records.isNewcomer(GROUP_ID, 406, NOW)).toBe(false);
      const second = s.who.of(comment(), NOW + 60_000);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await second).toMatchObject({ standing: "new" });
      expect(callsOf(s.out.log, "member")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks a commenter who never joined as a new member, and one restricted outside the group too", async () => {
    const left = setup(async () => ({ status: "left", user: { id: 406 } }));
    expect(await left.who.of(comment(), NOW)).toMatchObject({ standing: "new" });
    expect(left.records.isNewcomer(GROUP_ID, 406, NOW)).toBe(true);
    const outside = setup(async () => ({ status: "restricted", is_member: false, user: { id: 406 } }));
    expect(await outside.who.of(comment(), NOW)).toMatchObject({ standing: "new" });
    expect(outside.records.isNewcomer(GROUP_ID, 406, NOW)).toBe(true);
  });
});
