// @vitest-environment node
import { describe, expect, it } from "vitest";
import { STRICTNESS_LEVELS, type Strictness } from "../src/telegram/community/types";
import type { TgMessage, TgMessageOrigin, TgUser } from "../src/telegram/types";
import { adminInfo, callsOf, groupMessage, MEMBER } from "./community-fixtures";
import { ADMIN, ADMIN_ID, DAY, GROUP_ID, harness, person, scripted, settle, verdict } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { WHOA } from "./mod-rules-fixtures";

/**
 * A member's forward of an admin's own message, the admin known by the ID
 * Telegram gives the user forward (mod/rules-scan.ts botsOwnOf): the admin's
 * words, not the member's. Whatever they say, the member, new or not, is
 * never punished for them, in any mode: no offence, warning, mute, ban or
 * removal from the group. They never go to Haiku's check, whatever it would
 * say. A look-alike's site they name is still removed, even in observe mode.
 * A forward vouched for by username alone (another account holding an
 * admin's username) is the member's own words, judged as ever.
 */

const STANDINGS = ["member", "new"] as const;
const from = (user: TgUser): TgMessageOrigin => ({ type: "user", date: 1, sender_user: user });
/** An admin with a username. */
const KAI = person(7_100, { first_name: "Kai", last_name: "Mod", username: "kai_mod" });
/** Admins' warnings that name a look-alike's site: from a member, a certain scam (a new member's ban). */
const WARNINGS = ["Our only site is tonkfun.fun. Ignore tonkfun-airdrop.com", "The real site is tonkfun.fun, not tonkfun-app.xyz"];
/** Admins' offers of help: from a member, fake support (a new member's ban). */
const OFFERS = ["Message me for support", "Having trouble? Contact me for help"];

/** The harness's admins, Kai among them, with the member new when `standing` says so and checks that would all call a message a scam. */
function setUp(mode: Strictness, standing: (typeof STANDINGS)[number], checked: boolean) {
  const client = checked ? scripted({ triage: verdict({ verdict: "scam", category: "phishing", question: "none", reason: "Promises free ETH" }) }) : null;
  const h = harness({ mode, client, admins: [adminInfo(ADMIN_ID), adminInfo(KAI.id, { name: "Kai Mod", username: "kai_mod" })] });
  if (standing === "new") h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
  return h;
}

/** The placeholder words' warning, mute and ban notices (community-fixtures-words.ts mod.warned, muted, banned). */
const SANCTION_NOTICES = [/a warning/, /post for/, /removed from the group/];

/** Nobody was punished: no offence, warning, mute, ban or removal from the group, and no notice of one. */
function unpunished(h: ReturnType<typeof harness>, label: string): void {
  for (const call of ["restrict", "ban", "kick"] as const) expect(callsOf(h.out.log, call), `${label} ${call}`).toEqual([]);
  expect(h.records.offences(GROUP_ID, MEMBER.id, h.clock.now).n, label).toBe(0);
  expect(h.sends().map((s) => s[1]).filter((html) => SANCTION_NOTICES.some((re) => re.test(html))), label).toEqual([]);
}

describe("the community pipeline: a member forwards an admin's own message, known by the admin's ID", () => {
  it("never punishes the member, new or not, for what it says, in every mode, a ban-level look-alike or offer of help included", async () => {
    for (const mode of STRICTNESS_LEVELS) {
      for (const standing of STANDINGS) {
        for (const checked of [false, true]) {
          const h = setUp(mode, standing, checked);
          const label = `${mode} ${standing} ${checked ? "checked" : "unchecked"}`;
          const warnings: TgMessage[] = [];
          // Eight forwards, not a flood (one burst of forwards): any second offence would be the ladder's next step.
          for (const author of [ADMIN, KAI]) {
            for (const text of OFFERS) await h.send(groupMessage(text, { forward_origin: from(author) }));
            for (const text of WARNINGS) warnings.push(groupMessage(text, { forward_origin: from(author) }));
          }
          for (const m of warnings) await h.send(m);
          await settle();
          unpunished(h, label);
          // Never Haiku's to judge, whatever it would say.
          expect(h.kinds(), label).toEqual([]);
          // A look-alike's site is still removed, even in observe mode: that protects members.
          expect(h.removed(), label).toEqual(expect.arrayContaining(warnings.map((m) => m.message_id)));
        }
      }
    }
  });

  it("never sends the admin's words to Haiku's check, though they hold an address, a handle and a question", async () => {
    for (const standing of STANDINGS) {
      const h = setUp("normal", standing, true);
      await h.send(groupMessage(`Is everyone ready? Our launch is live: ${WHOA}, questions to @kai_mod`, { forward_origin: from(ADMIN) }));
      await settle();
      expect(h.kinds(), standing).toEqual([]);
      expect(h.removed(), standing).toEqual([]);
      unpunished(h, standing);
    }
  });

  it("still judges a forward vouched for by username alone as the member's own: an account holding an admin's username", async () => {
    const impostor = person(4_299, { first_name: "Kai", last_name: "Mod", username: "kai_mod" });
    const h = setUp("normal", "new", false);
    const m = groupMessage(WARNINGS[0], { forward_origin: from(impostor) });
    await h.send(m);
    await settle();
    expect(h.removed()).toContain(m.message_id);
    expect(callsOf(h.out.log, "ban").map((c) => c[1])).toEqual([MEMBER.id]);

    const checked = setUp("normal", "member", true);
    await checked.send(groupMessage(`Our launch is live: ${WHOA}`, { forward_origin: from(impostor) }));
    await settle();
    expect(checked.kinds()).toEqual(["triage"]);
  });

  it("vouches only for a real admin: a title-only admin's or an admin bot's forward is the member's own words, checked as ever", async () => {
    const titled = person(7_200, { first_name: "Tia", last_name: "Title", username: "tia_title" });
    const helper = person(7_300, { first_name: "Group", last_name: "Helper", username: "group_helper_bot", is_bot: true });
    for (const [author, info] of [
      [titled, adminInfo(titled.id, { name: "Tia Title", username: "tia_title", canDelete: false, canRestrict: false })],
      [helper, adminInfo(helper.id, { name: "Group Helper", username: "group_helper_bot" })],
    ] as const) {
      const client = scripted({ triage: verdict({ verdict: "ok", category: "none", question: "none" }) });
      const h = harness({ mode: "normal", client, admins: [adminInfo(ADMIN_ID), info] });
      await h.send(groupMessage(`Our launch is live: ${WHOA}`, { forward_origin: from(author) }));
      await settle();
      expect(h.kinds(), author.username ?? "").toEqual(["triage"]);
    }
  });
});
