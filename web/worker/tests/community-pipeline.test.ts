// @vitest-environment node
import { describe, expect, it } from "vitest";
import { actionsOf, ADMIN_CHAT_ID, callsOf, groupMessage, MEMBER, OWNER_ID } from "./community-fixtures";
import { NOW } from "./fixtures";
import { DAY, GROUP, GROUP_ID, harness, person, SEED, settle, testWords } from "./community-pipeline-fixtures";

/** The pipeline end to end on the rules alone: what is removed, who is punished, who is told, and that nothing reaches the model. */
describe("the community pipeline: rules", () => {
  it("bans a new member's scam link, deletes it and alerts, with no model call", async () => {
    const h = harness();
    h.records.markNewcomer(GROUP_ID, MEMBER.id, NOW - 60_000, NOW + DAY);
    const m = groupMessage("Claim your airdrop now at tonkfun-airdrop.xyz");
    expect(await h.send(m)).toBe("handled");
    await settle();
    expect(h.removed()).toContain(m.message_id);
    expect(callsOf(h.out.log, "ban")).toEqual([[GROUP_ID, MEMBER.id]]);
    expect(h.alerts.map((a) => [a.kind, a.category])).toEqual([["action", "lookalike"]]);
    expect(h.calls).toHaveLength(0);
  });

  it("deletes a scam report that names the handle, warns, alerts the team, and punishes nobody", async () => {
    const h = harness();
    const m = groupMessage("Is @tonkfun_support real? They DMed me about my wallet");
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(h.sends().map((s) => s[1])).toContain(testWords.safety.scamReport);
    expect(h.alerts.map((a) => a.kind)).toEqual(["scam_report"]);
    expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
    expect(callsOf(h.out.log, "ban")).toEqual([]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(h.calls).toHaveLength(0);
  });

  it("in observe mode deletes a recovery phrase and a look-alike link, and only reports the rest", async () => {
    const h = harness({ mode: "observe", client: null });
    const seed = groupMessage(SEED);
    const lookalike = groupMessage("everyone go to tonkfun-claim.xyz", { from: person(202) });
    const unknown = groupMessage("prices on coolcoin.xyz look good", { from: person(203) });
    for (const m of [seed, lookalike, unknown]) await h.send(m);
    await settle();
    expect(h.removed().sort()).toEqual([seed.message_id, lookalike.message_id].sort());
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(callsOf(h.out.log, "ban")).toEqual([]);
    expect(h.alerts.map((a) => a.kind)).toEqual(["secret", "observe", "observe"]);
  });

  it("deletes a recovery phrase with the neutral line, also shown to the poster alone, and never sends it to the model", async () => {
    const h = harness({ client: undefined });
    const m = groupMessage(SEED);
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    const notice = h.sends().find((s) => s[1] === testWords.safety.secret);
    expect(notice?.[2]).toMatchObject({ kind: "notice", ephemeralTo: MEMBER.id });
    expect(h.alerts[0]).toMatchObject({ kind: "secret", excerpt: null });
    expect(h.calls).toHaveLength(0);
    expect(h.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(0);
  });

  it("deletes a flaw report, alerts without an excerpt, points to the Security page, and makes no model call", async () => {
    const h = harness();
    const details = "the curve can be called again before the first call finishes, and the reserves are read twice. ".repeat(3);
    const m = groupMessage(`I found a reentrancy vulnerability in the launchpad contract. Steps to reproduce: ${details}`);
    await h.send(m);
    await settle();
    expect(h.removed()).toEqual([m.message_id]);
    expect(h.alerts.map((a) => [a.kind, a.excerpt])).toEqual([["security", null]]);
    expect(h.sends().map((s) => s[1])).toContain(testWords.answer.flaw);
    expect(h.calls).toHaveLength(0);
  });

  it("answers a strong crisis phrase with the crisis reply and an urgent alert, and moderates nothing", async () => {
    const h = harness();
    const m = groupMessage("honestly i want to die, nothing works out for me");
    await h.send(m);
    await settle();
    const [chat, text, options] = h.sends()[0];
    expect(chat).toBe(GROUP_ID);
    expect(text).toBe(testWords.crisis.body);
    expect(options).toMatchObject({ replyTo: m.message_id, keyboard: { inline_keyboard: [[{ text: testWords.crisis.button, url: "https://findahelpline.com/" }]] } });
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ kind: "crisis", urgent: true, member: { id: MEMBER.id } });
    expect(h.removed()).toEqual([]);
    expect(callsOf(h.out.log, "restrict")).toEqual([]);
    expect(h.calls).toHaveLength(0);
  });

  it("does nothing about the same greeting from three members", async () => {
    const h = harness();
    for (const id of [301, 302, 303]) await h.send(groupMessage("gm everyone, have a wonderful day in the tonkfun community", { from: person(id) }));
    await settle();
    expect(actionsOf(h.out.log)).toEqual([]);
    expect(h.alerts).toEqual([]);
    expect(h.calls).toHaveLength(0);
  });

  it("sends a /report to the admins with who reported it, deletes the command and thanks the reporter", async () => {
    const h = harness();
    const spam = groupMessage("buy my course, best signals", { from: person(404, { first_name: "Spam" }) });
    await h.send(spam);
    const report = groupMessage("/report spam", { from: person(405), reply_to_message: spam });
    expect(await h.send(report)).toBe("handled");
    await settle();
    expect(h.removed()).toEqual([report.message_id]);
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ kind: "report", member: { id: 404 }, reporter: { id: 405 }, messageId: spam.message_id });
    expect(h.sends().map((s) => s[1])).toContain(testWords.report.thanks);
    expect(h.records.counts(GROUP_ID, NOW).reports).toBe(1);
    expect(h.calls).toHaveLength(0);
  });

  it("treats a channel post's commenter who never joined as a new member", async () => {
    const h = harness({ discussion: true, client: null, out: { member: async (_chat, user) => ({ status: "left", user: { id: user } }) } });
    const post = { message_id: 50, date: Math.floor(NOW / 1000), chat: GROUP, is_automatic_forward: true };
    const m = groupMessage("nice, more at coolcoin.xyz", { from: person(406), reply_to_message: post, message_thread_id: 50 });
    await h.send(m);
    await settle();
    expect(callsOf(h.out.log, "member")).toEqual([[GROUP_ID, 406]]);
    expect(h.records.isNewcomer(GROUP_ID, 406, NOW)).toBe(true);
    expect(h.removed()).toEqual([m.message_id]);
    expect(h.sends().map((s) => s[1]).join("\n")).toContain("new members can't post links yet");
  });

  it("shows /rules with Privacy and Docs buttons once per 2 minutes, and deletes it after 10", async () => {
    const h = harness();
    expect(await h.send(groupMessage("/rules"))).toBe("handled");
    await h.send(groupMessage("/rules", { from: person(202) }));
    await settle();
    expect(h.sends()).toHaveLength(1);
    const [, text, options] = h.sends()[0];
    expect(text.split("\n")[0]).toBe(`<b>${testWords.rules.title}</b>`);
    expect(options.keyboard?.inline_keyboard.flat().map((b) => b.url)).toEqual(["https://www.tonkfun.fun/privacy/telegram", "https://www.tonkfun.fun/docs"]);
    expect(callsOf(h.out.log, "removeLater")).toEqual([[GROUP_ID, 5_001, 10 * 60_000]]);
  });

  it("hands the admin chat's commands to the controls, and never moderates or reads its messages", async () => {
    const h = harness();
    const team = { id: ADMIN_CHAT_ID, type: "supergroup" as const, title: "Team" };
    expect(await h.send(groupMessage(SEED, { chat: team, from: person(OWNER_ID) }))).toBe("handled");
    expect(await h.send(groupMessage("/status", { chat: team, from: person(OWNER_ID) }))).toBe("handled");
    expect(await h.send(groupMessage("/check 0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95", { chat: team, from: person(OWNER_ID) }))).toBe("pass");
    await settle();
    expect(h.removed()).toEqual([]);
    expect(h.sends().map((s) => s[0])).toEqual([ADMIN_CHAT_ID]);
    expect(h.sends()[0][1]).toContain(testWords.admin.status.title);
    expect(h.alerts).toEqual([]);
    expect(h.calls).toHaveLength(0);
  });

  it("leaves module 14's commands to it, and channel copies alone", async () => {
    const h = harness();
    expect(await h.send(groupMessage("/check 0xfd42e33d5d3a8b04ed95f43e9453f7b17b23cd95"))).toBe("pass");
    expect(await h.send(groupMessage("New launch!", { is_automatic_forward: true }))).toBe("handled");
    await settle();
    expect(actionsOf(h.out.log)).toEqual([]);
  });
});
