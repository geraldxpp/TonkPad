import { describe, expect, it } from "vitest";
import { createAlerts } from "../src/telegram/community/alerts";
import { ADMIN_CHAT_ID, callsOf, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { alertOf, setupAlerts as setup, settle } from "./community-alerts-fixtures";
import { HOUR, MIN, NOW, SEC } from "./fixtures";

describe("alert pacing", () => {
  it("alerts the same member and case once per 10 minutes", async () => {
    const { raise, sends, at } = setup();
    await raise(alertOf(), alertOf(), alertOf({ undo: "mute" }), alertOf({ member: { id: 102, name: "Kim", username: null, since: null } }));
    expect(sends()).toHaveLength(3);
    at(NOW + 9 * MIN);
    await raise(alertOf());
    expect(sends()).toHaveLength(3);
    at(NOW + 10 * MIN);
    await raise(alertOf());
    expect(sends()).toHaveLength(4);
  });

  it("always confirms an admin's control changes, even two in a row by the same admin", async () => {
    const { raise, sends } = setup();
    const control = (done: string) => alertOf({ kind: "control", category: null, undo: null, excerpt: null, link: null, done });
    await raise(control("Alex paused answers"), control("Alex set the group to strict"));
    expect(sends().map(({ html }) => html.includes("Alex"))).toEqual([true, true]);
  });

  it("turns more than 6 alerts a minute into one summary a minute, but never holds back a member at risk", async () => {
    const { alerts, raise, sends, at } = setup();
    const member = (id: number) => ({ id, name: `Member ${id}`, username: null, since: null });
    // Nothing to undo: an alert with an Undo keeps its own message in a storm (community-alerts-storm.test.ts).
    await raise(...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => alertOf({ member: member(id), undo: null, category: "lookalike" })));
    expect(sends()).toHaveLength(6);
    await raise(alertOf({ kind: "crisis", category: "crisis", urgent: true, routine: false, undo: null, member: member(10) }));
    expect(sends()).toHaveLength(7);
    await alerts.tick(NOW + 59 * SEC);
    expect(sends()).toHaveLength(7);
    await alerts.tick(NOW + MIN);
    const summary = sends()[7];
    expect(summary.html.split("\n")[0]).toBe("<b>Alert: digest</b> · 3");
    for (const id of [7, 8, 9]) expect(summary.html).toContain(`Member ${id}`);
    expect(summary.options.keyboard).toBeUndefined();
    at(NOW + 61 * SEC);
    await raise(alertOf({ member: member(11), undo: null, category: "lookalike" }));
    expect(sends()).toHaveLength(9);
  });

  it("digests observe reports, previews and newcomer notes about every 10 minutes, with excerpts only for scams and cases that need a person", async () => {
    const { alerts, raise, sends } = setup();
    const member = (id: number) => ({ id, name: `Member ${id}`, username: null, since: null });
    await raise(
      alertOf({ kind: "observe", member: member(1), excerpt: "plain chit chat" }),
      alertOf({ kind: "observe", category: "lookalike", member: member(2), excerpt: "a scam excerpt" }),
      alertOf({ kind: "observe", category: "unknown_link", member: member(3), excerpt: "needs a person", routine: false }),
      alertOf({ kind: "preview", category: null, member: member(4), excerpt: "the question", done: null, preview: "The proposed answer" }),
      alertOf({ kind: "action", category: "newcomer_link", undo: null, member: member(5), excerpt: "first link" }),
    );
    expect(sends()).toHaveLength(0);
    await alerts.tick(NOW + 9 * MIN);
    expect(sends()).toHaveLength(0);
    await alerts.tick(NOW + 10 * MIN);
    const [digest] = sends();
    expect(digest.html.split("\n")[0]).toBe("<b>Alert: digest</b> · 5");
    for (const shown of ["a scam excerpt", "needs a person", "The proposed answer", "Member 5"]) expect(digest.html).toContain(shown);
    for (const hidden of ["plain chit chat", "the question", "first link"]) expect(digest.html).not.toContain(hidden);
  });

  it("digests routine deletes with nothing to undo (an unknown link, a brand forward, a raided copy); a banned raider, a sanction and a case for a person alert at once", async () => {
    const { alerts, raise, sends } = setup();
    const member = (id: number) => ({ id, name: `Member ${id}`, username: null, since: null });
    await raise(
      alertOf({ category: "unknown_link", undo: null, member: member(1) }),
      alertOf({ category: "brand_forward", undo: null, member: member(2) }),
      alertOf({ category: "link_raid", undo: null, member: member(3), excerpt: null }),
      alertOf({ category: "link_raid", undo: "ban", member: member(4), excerpt: null }),
      alertOf({ category: "unknown_link", undo: "warn", member: member(5) }),
      alertOf({ category: "unknown_link", undo: null, routine: false, member: member(6) }),
    );
    expect(sends().map(({ html }) => /Member (\d)/.exec(html)?.[1])).toEqual(["4", "5", "6"]);
    await alerts.tick(NOW + 10 * MIN);
    const digest = sends()[3];
    expect(digest.html.split("\n")[0]).toBe("<b>Alert: digest</b> · 3");
    for (const id of [1, 2, 3]) expect(digest.html).toContain(`Member ${id}`);
    expect(digest.options.keyboard).toBeUndefined();
  });
});

describe("alert cleanup", () => {
  it("schedules routine alerts for deletion at 47 hours, and leaves cases that need a person to the chat", async () => {
    const { raise, records } = setup();
    await raise(alertOf(), alertOf({ kind: "lost_funds", category: "lost_funds", undo: null, routine: false }), alertOf({ kind: "crisis", category: "crisis", undo: null, urgent: true, member: null }));
    expect(records.dueDeletes(NOW + 47 * HOUR - 1)).toEqual([]);
    expect(records.dueDeletes(NOW + 47 * HOUR)).toEqual([{ chat: ADMIN_CHAT_ID, messageId: 5_001 }]);
  });

  it("schedules a digest only when every item in it is routine", async () => {
    const { alerts, raise, records } = setup();
    await raise(alertOf({ kind: "observe" }));
    await alerts.tick(NOW + 10 * MIN);
    await raise(alertOf({ kind: "observe", routine: false, member: { id: 7, name: "N", username: null, since: null } }));
    await alerts.tick(NOW + 20 * MIN);
    expect(records.dueDeletes(NOW + 50 * HOUR)).toEqual([{ chat: ADMIN_CHAT_ID, messageId: 5_001 }]);
  });

  it("sends without the group's title when it can't be read, and never throws or rejects when a send fails", async () => {
    const groupTitle = (): string => {
      throw new Error("no title");
    };
    const out = recordOut();
    const alerts = createAlerts({ out, records: memoryRecords(), adminChat: ADMIN_CHAT_ID, words: testWords, now: () => NOW, groupTitle });
    alerts.alert(alertOf());
    await settle();
    expect((callsOf(out.log, "send")[0]?.[1] as string).split("\n")[0]).toBe("<b>Alert: action</b> · Case: unknown_link");

    const down = recordOut({ send: async () => Promise.reject(new Error("down")) });
    const failing = createAlerts({ out: down, records: memoryRecords(), adminChat: ADMIN_CHAT_ID, words: testWords, now: () => NOW, groupTitle });
    expect(() => failing.alert(alertOf())).not.toThrow();
    failing.alert(alertOf({ kind: "observe", member: { id: 9, name: "N", username: null, since: null } }));
    await expect(failing.tick(NOW + 10 * MIN)).resolves.toBeUndefined();
    await settle();
    expect(callsOf(down.log, "send")).toHaveLength(2);
  });
});
