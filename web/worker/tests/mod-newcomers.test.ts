import { describe, expect, it } from "vitest";
import { LIFTED, MUTED, TEXT_ONLY } from "../src/telegram/community/permissions";
import { callsOf, GROUP_ID, memoryRecords, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";
import { DAY, flush, keyboardOf, MINUTE, person, press, SECOND, setup, SITE, unix } from "./mod-newcomers-setup";

describe("the new-member check", () => {
  it("restricts a newcomer until the deadline plus 5 minutes and posts one check replying to the join message", async () => {
    const { out, records, joins, join } = setup();
    await join([person(201)], 71, NOW);
    expect(callsOf(out.log, "restrict")).toEqual([[GROUP_ID, 201, MUTED, unix(NOW + 10 * MINUTE)]]);
    const sends = callsOf(out.log, "send");
    expect(sends).toHaveLength(1);
    expect(sends[0][1]).toBe('Welcome, <a href="tg://user?id=201">newcomer</a>. Tap the button within 5 minutes to show you\'re human.');
    expect(sends[0][2]).toMatchObject({ kind: "check", replyTo: 71 });
    expect(keyboardOf(sends[0])).toEqual([[{ text: "I'm human", callback_data: "h:0" }]]);
    expect(records.pending(GROUP_ID, 201)).toEqual({ chat: GROUP_ID, user: 201, messageId: 5001, joinMessageId: 71, deadline: NOW + 5 * MINUTE, target: null, tries: 0 });
    expect(records.counts(GROUP_ID, NOW).checked).toBe(1);
    expect(joins).toEqual([NOW]);
  });

  it("answers anyone else's press with a toast and changes nothing", async () => {
    const { out, records, newcomers, join } = setup();
    await join([person(201)], 71, NOW);
    expect(await newcomers.onPress(press(person(999), "h:0", 5001), NOW + SECOND)).toBe(true);
    expect(await newcomers.onPress(press(person(201), "h:0", 4999), NOW + SECOND)).toBe(true);
    expect(callsOf(out.log, "answerPress").map((c) => c[1])).toEqual(["This check is for someone else.", "This check is for someone else."]);
    expect(records.pending(GROUP_ID, 201)).not.toBeNull();
    expect(await newcomers.onPress(press(person(201), "x:u:1:2", 5001), NOW)).toBe(false);
  });

  it("shares one check among three joiners: one passes, one times out, one still waits", async () => {
    const { out, records, alerts, newcomers, at, join } = setup();
    await join([person(201)], 71, NOW);
    await join([person(202)], 72, NOW + 5 * SECOND);
    await join([person(203)], 73, NOW + 10 * SECOND);
    expect(callsOf(out.log, "send")).toHaveLength(1);
    expect(callsOf(out.log, "edit").at(-1)?.[2]).toContain("tg://user?id=203");

    expect(await newcomers.onPress(press(person(201), "h:0", 5001), at(NOW + MINUTE))).toBe(true);
    expect(callsOf(out.log, "answerPress").at(-1)).toEqual(["q201:h:0", "Thanks, you can chat now."]);
    expect(callsOf(out.log, "restrict").at(-1)).toEqual([GROUP_ID, 201, TEXT_ONLY, unix(NOW + MINUTE + 3 * DAY)]);
    expect(records.isNewcomer(GROUP_ID, 201, NOW + 2 * DAY)).toBe(true);
    expect(records.counts(GROUP_ID, NOW).passed).toBe(1);
    const edited = callsOf(out.log, "edit").at(-1)?.[2] as string;
    expect(edited).not.toContain("id=201");
    expect(edited).toContain("id=202");

    // The tick queues the removal and returns; Telegram's answers come after it.
    await newcomers.tick(at(NOW + 5 * MINUTE + 6 * SECOND));
    await flush();
    expect(callsOf(out.log, "kick")).toEqual([[GROUP_ID, 202]]);
    expect(callsOf(out.log, "remove")).toContainEqual([GROUP_ID, [72]]);
    expect(records.pending(GROUP_ID, 202)).toBeNull();
    expect(records.pending(GROUP_ID, 203)).not.toBeNull();
    const lastEdit = callsOf(out.log, "edit").at(-1);
    expect(lastEdit?.[1]).toBe(5001);
    expect(lastEdit?.[2]).toContain("id=203");
    expect(lastEdit?.[2]).not.toContain("id=202");
    expect(callsOf(out.log, "remove")).not.toContainEqual([GROUP_ID, [5001]]);
    expect(alerts).toEqual([expect.objectContaining({ kind: "action", category: null, undo: null, member: expect.objectContaining({ id: 202 }), done: "Member was removed from the group." })]);

    // The welcome went out once, for the one who passed, and goes with their join message after 2 minutes.
    const welcome = callsOf(out.log, "send").at(-1);
    expect(welcome?.[1]).toBe('Welcome, <a href="tg://user?id=201">newcomer</a>. Ask me with /ask and see /rules.');
    expect(keyboardOf(welcome as unknown[])).toEqual([[{ text: "Privacy", url: `${SITE}/privacy/telegram` }]]);
    expect(callsOf(out.log, "removeLater")).toEqual(expect.arrayContaining([[GROUP_ID, 5002, 120_000], [GROUP_ID, 71, 120_000]]));

    await newcomers.tick(at(NOW + 6 * MINUTE));
    await flush();
    expect(callsOf(out.log, "remove")).toContainEqual([GROUP_ID, [5001]]);
  });

  it("resolves a check restored from the records after a restart", async () => {
    const records = memoryRecords({ strictness: "normal" });
    records.setPending({ chat: GROUP_ID, user: 301, messageId: 4444, joinMessageId: 70, deadline: NOW - SECOND, target: null, tries: 0 });
    const { out, newcomers } = setup({}, records);
    await newcomers.tick(NOW);
    await flush();
    expect(callsOf(out.log, "kick")).toEqual([[GROUP_ID, 301]]);
    expect(callsOf(out.log, "remove")).toEqual([[GROUP_ID, [70]], [GROUP_ID, [4444]]]);
    expect(records.pending(GROUP_ID, 301)).toBeNull();
  });

  it("uses 4 numbered buttons, 3 minutes and two tries in strict mode and in a raid", async () => {
    for (const options of [{ strictness: "strict" as const }, { raid: true }]) {
      const { out, records, newcomers, join } = setup(options);
      await join([person(201), person(202)], 71, NOW);
      const target = records.pending(GROUP_ID, 201)?.target ?? 0;
      const send = callsOf(out.log, "send")[0];
      expect(send[1]).toContain(`within 3 minutes`);
      expect(send[1]).toContain(`Tap ${target}`);
      const buttons = keyboardOf(send)[0];
      expect(buttons).toHaveLength(4);
      expect(buttons.map((b) => ("callback_data" in b ? b.callback_data : ""))).toContain(`h:${target}`);
      const wrong = buttons.map((b) => ("callback_data" in b ? b.callback_data : "")).find((d) => d !== `h:${target}`) as string;
      await newcomers.onPress(press(person(201), wrong, 5001), NOW + SECOND);
      expect(callsOf(out.log, "answerPress").at(-1)?.[1]).toBe("Not that one. One more try.");
      expect(records.pending(GROUP_ID, 201)?.tries).toBe(1);
      await newcomers.onPress(press(person(201), wrong, 5001), NOW + 2 * SECOND);
      expect(callsOf(out.log, "kick")).toEqual([[GROUP_ID, 201]]);
      await newcomers.onPress(press(person(202), `h:${target}`, 5001), NOW + 3 * SECOND);
      await flush();
      expect(records.isNewcomer(GROUP_ID, 202, NOW + MINUTE)).toBe(true);
      expect(callsOf(out.log, "remove")).toContainEqual([GROUP_ID, [5001]]);
    }
  });

  it("keeps everyone on a check that can't be posted restricted while it is tried every 15 seconds, and only after 30 minutes lets them in text only, marked new, with an alert", async () => {
    const { out, records, alerts, newcomers, at, join } = setup({ out: { send: async () => null } });
    await join([person(201)], 71, NOW);
    for (let t = 15 * SECOND; t <= 29 * MINUTE + 45 * SECOND; t += 15 * SECOND) {
      await newcomers.tick(at(NOW + t));
      await flush();
    }
    // Tried at once and then every 15 seconds; never let in, however many tries failed.
    expect(callsOf(out.log, "send")).toHaveLength(120);
    expect(callsOf(out.log, "restrict").some((c) => c[2] !== MUTED)).toBe(false);
    expect(alerts).toEqual([]);
    expect(records.pending(GROUP_ID, 201)).toMatchObject({ messageId: 0 });
    expect(records.isNewcomer(GROUP_ID, 201, NOW + 30 * MINUTE)).toBe(false);

    await newcomers.tick(at(NOW + 30 * MINUTE));
    await flush();
    // Never every permission: text only for their newcomer days, as if they had passed.
    expect(callsOf(out.log, "restrict").at(-1)).toEqual([GROUP_ID, 201, TEXT_ONLY, unix(NOW + 30 * MINUTE + 3 * DAY)]);
    expect(callsOf(out.log, "restrict").some((c) => c[2] === LIFTED)).toBe(false);
    expect(records.isNewcomer(GROUP_ID, 201, NOW + 31 * MINUTE)).toBe(true);
    expect(records.pending(GROUP_ID, 201)).toBeNull();
    expect(alerts).toEqual([expect.objectContaining({ kind: "action", category: null, member: expect.objectContaining({ id: 201 }), done: testWords.admin.checkFailed })]);

    let tries = 0;
    const second = setup({ out: { send: async () => (++tries <= 2 ? null : 6001) } });
    await second.join([person(201)], 71, NOW);
    await second.newcomers.tick(second.at(NOW + 15 * SECOND));
    await flush();
    expect(second.records.pending(GROUP_ID, 201)?.messageId).toBe(0);
    await second.newcomers.tick(second.at(NOW + 30 * SECOND));
    await flush();
    expect(second.records.pending(GROUP_ID, 201)).toMatchObject({ messageId: 6001, deadline: NOW + 30 * SECOND + 5 * MINUTE });
  });

  it("says neither removed nor let in unchecked when Telegram won't remove someone who didn't pass", async () => {
    const { alerts, newcomers, at, join } = setup({ out: { kick: async () => false } });
    await join([person(201)], 71, NOW);
    await newcomers.tick(at(NOW + 5 * MINUTE + 6 * SECOND));
    await flush();
    expect(alerts).toEqual([expect.objectContaining({ kind: "action", category: null, member: expect.objectContaining({ id: 201 }), done: null })]);
  });
});
