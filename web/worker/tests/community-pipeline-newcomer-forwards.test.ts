// @vitest-environment node
import { describe, expect, it } from "vitest";
import { STRICTNESS_LEVELS } from "../src/telegram/community/types";
import type { TgMessageOrigin, TgUser } from "../src/telegram/types";
import { adminInfo, BOT, callsOf, groupMessage, MEMBER } from "./community-fixtures";
import { ADMIN, ADMIN_ID, DAY, GROUP_ID, harness, person, scripted, settle, testWords, verdict } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { WHOA } from "./mod-rules-fixtures";

/**
 * A new member's forward (mod/rules-forwards.ts newcomerForward). One its
 * author vouches for is no link, in any mode, so nothing is removed and
 * nobody noted, warned or muted: the bot's own answer or an admin's message
 * (known by the user forward's ID), or by username the official channel's
 * post, a community group's or an admin's message. One of the bot's
 * usernames vouches for nothing. Anyone else's forward still counts, and so
 * do the links a vouched forward carries. (The official channel known by
 * its chat ID, and an admin by theirs, vouch for more: their words aren't
 * the member's at all. community-pipeline-channel-forwards.test.ts and
 * community-pipeline-admin-forwards.test.ts.)
 */

const LABEL = testWords.answer.label;
const TEXT = "The protocol fee is 1% of each curve trade, paid in ETH.";
const user = (u: TgUser): TgMessageOrigin => ({ type: "user", date: 1, sender_user: u });
/** A channel's post; each chat its own ID, so only a username can tell a look-alike from the official channel here. */
const channel = (title: string, username: string, id = -1_000_555): TgMessageOrigin => ({ type: "channel", date: 1, chat: { id, type: "channel", title, username } });
/** A community group's message, sent as the group: vouched for by its username alone. */
const GROUP_POST: TgMessageOrigin = { type: "chat", date: 1, sender_chat: { id: -1_000_666, type: "supergroup", title: "Tonkfun Chat", username: "tonkfun_chat" } };
/** An admin with a username and a role word in their name. */
const KAI = person(7_100, { first_name: "Kai", last_name: "Mod", username: "kai_mod" });

/** Each voucher's forward of `text`. */
const VOUCHED: ReadonlyArray<[string, TgMessageOrigin]> = [
  ["the bot's answer", user(BOT)],
  ["an admin's message", user(ADMIN)],
  ["another admin's message", user(KAI)],
  ["the official channel's post", channel("Tonkfun Launches", "tonkfun_launches")],
  ["a community group's message", GROUP_POST],
];

/** The harness's admins, Kai among them, and the member new in the group. */
function newcomerIn(options: Parameters<typeof harness>[0]) {
  const h = harness({ admins: [adminInfo(ADMIN_ID), adminInfo(KAI.id, { name: "Kai Mod", username: "kai_mod" })], ...options });
  h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
  return h;
}

/** The bot's answer as forwarded: its label in italics first. */
const forwardOf = (label: string, origin: TgMessageOrigin, text = TEXT) =>
  label === "the bot's answer" ? groupMessage(`${LABEL}\n${text}`, { forward_origin: origin, entities: [{ type: "italic", offset: 0, length: LABEL.length }] }) : groupMessage(text, { forward_origin: origin });

describe("the community pipeline: a new member forwards a message its author vouches for", () => {
  it("removes nothing, and notes, warns, mutes or reports no one, in every mode, with Haiku's check or without one", async () => {
    for (const mode of STRICTNESS_LEVELS) {
      for (const client of [null, scripted({ triage: verdict({ question: "none" }) })]) {
        const h = newcomerIn({ mode, client });
        // Twice each: a second newcomer link would be the ladder's next step.
        for (const [label, origin] of [...VOUCHED, ...VOUCHED]) await h.send(forwardOf(label, origin));
        await settle();
        const label = `${mode} ${client ? "checked" : "unchecked"}`;
        expect(h.removed(), label).toEqual([]);
        expect(h.sends(), label).toEqual([]);
        expect(callsOf(h.out.log, "restrict"), label).toEqual([]);
        expect(h.alerts, label).toEqual([]);
        expect(h.records.offences(GROUP_ID, MEMBER.id, h.clock.now).n, label).toBe(0);
      }
    }
  });

  it("still counts anyone else's forward: a stranger's, a look-alike of a voucher's, or an account holding the bot's username", async () => {
    const others = [user(person(4_244, { first_name: "Daily", last_name: "News" })), channel("Tonkfun Launches", "tonkfun_launches_official", -1_000_777), user({ ...BOT, id: 4_242 })];
    for (const mode of ["relaxed", "normal", "strict"] as const) {
      for (const origin of others) {
        const h = newcomerIn({ mode, client: null });
        const m = groupMessage(TEXT, { forward_origin: origin });
        await h.send(m);
        await settle();
        expect(h.removed(), mode).toEqual([m.message_id]);
        expect(h.alerts.map((a) => a.category), mode).toEqual(["newcomer_link"]);
      }
    }
  });

  it("still reads what a vouched forward says: its unknown link is a new member's link", async () => {
    const h = newcomerIn({ client: null });
    const m = groupMessage("Launch notes are up at pumpsignals.site", { forward_origin: channel("Tonkfun Launches", "tonkfun_launches") });
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(h.alerts.map((a) => a.category)).toEqual(["newcomer_link"]);
  });

  it("holds the token address in a forward vouched for by username alone when the check can't read it, as any new member's: removed, never an offence", async () => {
    const h = newcomerIn({ client: null });
    const m = groupMessage(`New launch: Whoa the Tarsier\n${WHOA}`, { forward_origin: GROUP_POST });
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(h.records.offences(GROUP_ID, MEMBER.id, h.clock.now).n).toBe(0);
  });
});
