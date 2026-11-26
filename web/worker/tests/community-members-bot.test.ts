import { describe, expect, it } from "vitest";
import { GROUP, GROUP_ID, OWNER_ID } from "./community-fixtures";
import { change, ME, membersBench, OTHER, person } from "./community-members-fixtures";

const FULL = { status: "administrator", can_delete_messages: true, can_restrict_members: true } as const;
const STRANGER = person(888);

describe("createMembers: the bot's own membership", () => {
  it("logs the group's ID and type when added, by the owner or by someone else, and never a user ID", async () => {
    const { members, lines, alerts } = membersBench();
    await members.onMyMember(change(ME, { status: "left" }, { status: "member" }, { from: person(OWNER_ID), chat: OTHER }));
    await members.onMyMember(change(ME, { status: "kicked" }, FULL, { from: STRANGER, chat: { id: -4_001, type: "group", title: "A basic group" } }));
    // Promoted where it already was: not an addition.
    await members.onMyMember(change(ME, { status: "member" }, FULL, { from: person(OWNER_ID), chat: OTHER }));
    expect(lines).toEqual([`added to group ${OTHER.id} (supergroup) by the owner`, "added to group -4001 (group) by someone else"]);
    expect(lines.join("\n")).not.toMatch(/888|7001/);
    expect(alerts).toEqual([]);
  });

  it("says nothing about a private chat, where my_chat_member means someone blocked or started the bot", async () => {
    const { members, lines, alerts } = membersBench();
    const chat = { id: 888, type: "private" as const };
    await members.onMyMember(change(ME, { status: "member" }, { status: "kicked" }, { from: STRANGER, chat }));
    await members.onMyMember(change(ME, { status: "kicked" }, { status: "member" }, { from: STRANGER, chat }));
    expect(lines).toEqual([]);
    expect(alerts).toEqual([]);
  });

  it("alerts in a community group when a right the bot needs is missing, or was there and is gone", async () => {
    const { members, alerts, lines } = membersBench();
    await members.onMyMember(change(ME, { status: "left" }, { status: "member" }, { from: person(OWNER_ID) }));
    await members.onMyMember(change(ME, { status: "member" }, FULL, { from: person(OWNER_ID) }));
    await members.onMyMember(change(ME, FULL, { status: "administrator", can_delete_messages: true }, { from: person(OWNER_ID) }));
    await members.onMyMember(change(ME, { status: "administrator", can_delete_messages: true }, { status: "administrator", can_delete_messages: true, can_restrict_members: false }));
    await members.onMyMember(change(ME, FULL, { status: "kicked" }, { from: STRANGER }));
    // The title is cleaned: "tonkfun.fun" would be a live link in the admin chat.
    expect(alerts.map((a) => [a.chat, a.kind, a.done])).toEqual([
      [GROUP_ID, "rights", "I'm missing a right in tonkfun·fun community."],
      [GROUP_ID, "rights", "I lost a right in tonkfun·fun community."],
      [GROUP_ID, "rights", "I'm missing a right in tonkfun·fun community."],
      [GROUP_ID, "rights", "I lost a right in tonkfun·fun community."],
    ]);
    expect(alerts.every((a) => a.member === null && !a.routine && !a.urgent)).toBe(true);
    expect(lines).toEqual([`added to group ${GROUP_ID} (supergroup) by the owner`]);
  });

  it("cleans the group's title in the rights alert, so a link, an @handle or a command in it is never live, and falls back to its ID", async () => {
    const { members, alerts } = membersBench();
    const hostile = { ...GROUP, title: "Claim at claim.evil.xyz, DM @scam_support or /start" };
    await members.onMyMember(change(ME, { status: "left" }, { status: "member" }, { from: person(OWNER_ID), chat: hostile }));
    await members.onMyMember(change(ME, { status: "left" }, { status: "member" }, { from: person(OWNER_ID), chat: { ...GROUP, title: "@@ //" } }));
    expect(alerts.map((a) => a.done)).toEqual([
      "I'm missing a right in Claim at claim·evil·xyz, DM scam_support or start.",
      `I'm missing a right in ${GROUP_ID}.`,
    ]);
  });

  it("only logs, and never alerts, for a group it doesn't own", async () => {
    const { members, alerts } = membersBench();
    await members.onMyMember(change(ME, FULL, { status: "left" }, { from: STRANGER, chat: OTHER }));
    await members.onMyMember(change(ME, { status: "left" }, { status: "member" }, { from: STRANGER, chat: OTHER }));
    expect(alerts).toEqual([]);
  });
});
