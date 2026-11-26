import { describe, expect, it } from "vitest";
import { type AdminChatWatchDeps, createAdminChatWatch } from "../src/telegram/community/setup-watch";
import type { AdminAlert } from "../src/telegram/community/types";
import { ADMIN_CHAT_ID, callsOf, recordOut, testWords } from "./community-fixtures";
import { MIN, NOW } from "./fixtures";

const HOUR = 60 * MIN;
const WEEK_S = 7 * 24 * 60 * 60;

/** A watch over a recorder; `timers` are the admin chat's auto-delete timers getChat gives in turn (undefined: off; null: unread). */
function watchBench(options: { counts?: Array<number | null | Error>; timers?: Array<number | undefined | null>; extra?: Partial<AdminChatWatchDeps> } = {}) {
  const counts = [...(options.counts ?? [])];
  const timers = [...(options.timers ?? [])];
  const out = recordOut({
    memberCount: async () => {
      const next = counts.shift() ?? null;
      if (next instanceof Error) throw next;
      return next;
    },
    chat: async (chat) => {
      const timer = timers.length > 0 ? timers.shift() : WEEK_S;
      return timer === null ? null : { id: chat, type: "supergroup", title: "Team", ...(timer === undefined ? {} : { message_auto_delete_time: timer }) };
    },
  });
  const alerts: AdminAlert[] = [];
  const watch = createAdminChatWatch({ out, adminChat: ADMIN_CHAT_ID, alerts: { alert: (a) => void alerts.push(a) }, words: testWords, autoDelete: "ok", ...options.extra });
  return { out, alerts, watch };
}

describe("createAdminChatWatch", () => {
  it("reads the admin chat's member count every 10 minutes and alerts once for each change", async () => {
    const { out, alerts, watch } = watchBench({ counts: [5, 5, 6, 6, 7] });
    for (const minutes of [0, 5, 10, 20, 30, 40]) await watch.tick(NOW + minutes * MIN);
    expect(callsOf(out.log, "memberCount")).toEqual([[ADMIN_CHAT_ID], [ADMIN_CHAT_ID], [ADMIN_CHAT_ID], [ADMIN_CHAT_ID], [ADMIN_CHAT_ID]]);
    expect(alerts.map((a) => a.done)).toEqual(["The admin chat now has 6 members.", "The admin chat now has 7 members."]);
    expect(alerts[0]).toMatchObject({ chat: null, kind: "setup", member: null, routine: false });
  });

  it("takes a failed read as no news, and never rejects", async () => {
    const { alerts, watch } = watchBench({ counts: [null, 5, new Error("network"), 9] });
    for (const minutes of [0, 10, 20, 30]) await watch.tick(NOW + minutes * MIN);
    expect(alerts.map((a) => a.done)).toEqual(["The admin chat now has 9 members."]);
  });

  it("reads the auto-delete timer every hour and alerts once each time it turns off or longer than a week", async () => {
    const { out, alerts, watch } = watchBench({ counts: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3], timers: [undefined, undefined, WEEK_S, WEEK_S * 4, null, 24 * 60 * 60] });
    for (let hour = 0; hour <= 6; hour += 1) await watch.tick(NOW + hour * HOUR);
    // The first read is an hour after start: the setup checks read it then.
    expect(callsOf(out.log, "chat")).toHaveLength(6);
    const autoDelete = alerts.filter((a) => a.done === testWords.admin.setup.autoDelete);
    // Off (once, though it stayed off), back to a week, then a month (again).
    expect(autoDelete).toHaveLength(2);
    expect(autoDelete[0]).toMatchObject({ chat: null, kind: "setup", routine: false });
  });

  it("reads the timer at its first tick when the setup checks couldn't, and hears of it from a later check without saying it twice", async () => {
    const unread = watchBench({ timers: [undefined], extra: { autoDelete: null } });
    await unread.watch.tick(NOW);
    expect(unread.alerts.map((a) => a.done)).toEqual([testWords.admin.setup.autoDelete]);
    unread.watch.sawAutoDelete("long");
    expect(unread.alerts).toHaveLength(1);
    unread.watch.sawAutoDelete("ok");
    unread.watch.sawAutoDelete("long");
    expect(unread.alerts).toHaveLength(2);
  });

  it("reads nothing before the admin chat passed its checks, so no alert waits for it", async () => {
    let ready = false;
    const { out, alerts, watch } = watchBench({ counts: [3, 4], timers: [undefined], extra: { autoDelete: null, ready: () => ready } });
    await watch.tick(NOW);
    await watch.tick(NOW + 2 * HOUR);
    expect(out.log).toEqual([]);
    ready = true;
    await watch.tick(NOW + 3 * HOUR);
    expect(callsOf(out.log, "memberCount")).toHaveLength(1);
    expect(alerts.map((a) => a.done)).toEqual([testWords.admin.setup.autoDelete]);
  });
});
