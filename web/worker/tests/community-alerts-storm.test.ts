import { afterEach, describe, expect, it, vi } from "vitest";
import { createAlerts } from "../src/telegram/community/alerts";
import type { SendOptions } from "../src/telegram/community/out";
import type { AdminAlert } from "../src/telegram/community/types";
import { alertOf, buttons, setupAlerts as setup } from "./community-alerts-fixtures";
import { ADMIN_CHAT_ID, callsOf, GROUP_ID, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { MIN, NOW, SEC } from "./fixtures";

const member = (id: number) => ({ id, name: `Member ${id}`, username: null, since: null });
/** A banned raider's alert, as the link-raid rule raises it: Unban, and only an ID to show. */
const banned = (id: number) => alertOf({ category: "link_raid", undo: "ban", excerpt: null, member: { id, name: "", username: null, since: null } });
const settle = async () => {
  for (let i = 0; i < 40; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("a storm keeps every alert an admin may need to undo (admin-privacy-docs#3)", () => {
  afterEach(() => void vi.useRealTimers());

  it("sends each of 9 bans in a minute as its own alert with Unban, in order, and folds nothing into a summary", async () => {
    const { alerts, sends } = setup();
    for (let id = 201; id <= 209; id += 1) alerts.alert(banned(id));
    await settle();
    const sent = sends();
    expect(sent).toHaveLength(9);
    expect(sent.map(({ options }) => buttons(options.keyboard).flat().find((b) => b.includes("x:b0:")))).toEqual(
      Array.from({ length: 9 }, (_, i) => `Unban=x:b0:${GROUP_ID}:${201 + i}`),
    );
    await alerts.tick(NOW + 10 * MIN);
    expect(sends()).toHaveLength(9);
  });

  it("keeps the raid alert's End raid mode after 8 rule actions in a minute", async () => {
    const { alerts, sends } = setup();
    for (let id = 1; id <= 8; id += 1) alerts.alert(alertOf({ undo: "warn", member: member(id) }));
    alerts.alert(alertOf({ kind: "raid", category: null, member: null, excerpt: null, undo: null, link: null, done: "Raid mode is on" }));
    await settle();
    const raid = sends().find(({ html }) => html.includes("Raid mode is on"));
    expect(buttons(raid?.options.keyboard).flat()).toContain(`End raid mode=x:r:${GROUP_ID}:0`);
  });

  it("still folds alerts with nothing to undo into one summary a minute", async () => {
    const { alerts, sends } = setup();
    for (let id = 1; id <= 6; id += 1) alerts.alert(alertOf({ undo: null, category: "lookalike", member: member(id) }));
    alerts.alert(banned(300));
    alerts.alert(alertOf({ undo: null, category: "lookalike", member: member(7) }));
    await settle();
    expect(sends()).toHaveLength(7);
    await alerts.tick(NOW + MIN);
    const summary = sends()[7];
    expect(summary.html).toContain("Member 7");
    expect(summary.options.keyboard).toBeUndefined();
  });

  it("goes one at a time: each waits for the one before it, so the admin chat's queue never drops one for waiting", async () => {
    let open = 0;
    let most = 0;
    const out = recordOut({
      send: async () => {
        open += 1;
        most = Math.max(most, open);
        await new Promise((resolve) => setTimeout(resolve, 1));
        open -= 1;
        return 9_000 + open;
      },
    });
    const alerts = createAlerts({ out, records: memoryRecords(), adminChat: ADMIN_CHAT_ID, words: testWords, now: () => NOW, groupTitle: () => "Group" });
    for (let id = 1; id <= 6; id += 1) alerts.alert(alertOf({ undo: null, category: "lookalike", member: member(id) }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    most = 0;
    for (let id = 401; id <= 405; id += 1) alerts.alert(banned(id));
    await vi.waitFor(() => expect(callsOf(out.log, "send")).toHaveLength(11));
    expect(most).toBe(1);
  });

  it("tries a dropped send again, and past 9 minutes 30 seconds folds the alert into a summary rather than keep it", async () => {
    vi.useFakeTimers();
    let clock = NOW;
    let up = false;
    const out = recordOut({ send: async () => (up ? 9_001 : null) });
    const alerts = createAlerts({ out, records: memoryRecords(), adminChat: ADMIN_CHAT_ID, words: testWords, now: () => clock, groupTitle: () => "Group" });
    const sends = () => callsOf(out.log, "send").map(([, html, options]) => ({ html: html as string, options: options as SendOptions }));
    for (let id = 1; id <= 6; id += 1) alerts.alert(alertOf({ undo: null, category: "lookalike", member: member(id) }));
    alerts.alert(banned(501));
    await vi.advanceTimersByTimeAsync(0);
    expect(sends()).toHaveLength(7);
    await vi.advanceTimersByTimeAsync(5 * SEC);
    expect(sends()).toHaveLength(8);
    up = true;
    clock = NOW + 9 * MIN + 30 * SEC;
    await vi.advanceTimersByTimeAsync(6 * SEC);
    expect(sends()).toHaveLength(9);
    const last = sends().at(-1);
    expect(last?.html).toContain("501");
    expect(last?.options.keyboard).toBeUndefined();
  });
});

describe("the 10-minute repeat rule (admin-privacy-docs#4)", () => {
  const report = (message: number): AdminAlert =>
    alertOf({ kind: "report", category: "reported", undo: null, routine: false, messageId: message, member: member(777), reporter: { id: 300 + message, name: "Rae", username: null } });

  it("alerts a second /report on another message of the same member", async () => {
    const { raise, sends } = setup();
    await raise(report(41), report(42));
    expect(sends()).toHaveLength(2);
    await raise(report(42));
    expect(sends()).toHaveLength(2);
  });

  it("alerts a second unsure check, and a second escalation, about another message", async () => {
    const { raise, sends } = setup();
    const unsure = (message: number) => alertOf({ kind: "unsure", category: "model_spam", undo: null, messageId: message, member: member(5) });
    const lost = (message: number) => alertOf({ kind: "lost_funds", category: "lost_funds", undo: null, routine: false, messageId: message, member: member(5) });
    await raise(unsure(51), unsure(52), unsure(52), lost(61), lost(62));
    expect(sends()).toHaveLength(4);
  });

  it("lists a repeat of an action with an Undo in the digest rather than drop it", async () => {
    const { alerts, raise, sends } = setup();
    const warned = (message: number) => alertOf({ undo: "warn", category: "unknown_link", messageId: message, member: member(8), excerpt: `message ${message}` });
    await raise(warned(71), warned(72));
    expect(sends()).toHaveLength(1);
    await alerts.tick(NOW + 9 * MIN + 30 * SEC);
    expect(sends()).toHaveLength(2);
    expect(sends()[1].html.split("\n")[0]).toBe("<b>Alert: digest</b> · 1");
    expect(sends()[1].html).toContain("Member 8");
  });

  it("still drops a repeat with nothing to undo", async () => {
    const { raise, sends, alerts } = setup();
    const removed = () => alertOf({ undo: null, category: "lookalike", member: member(9) });
    await raise(removed(), removed());
    await alerts.tick(NOW + 10 * MIN);
    expect(sends()).toHaveLength(1);
  });
});
