import { createAlerts } from "../src/telegram/community/alerts";
import type { SendOptions } from "../src/telegram/community/out";
import type { AdminAlert } from "../src/telegram/community/types";
import type { InlineKeyboard } from "../src/telegram/types";
import { ADMIN_CHAT_ID, callsOf, GROUP_ID, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";

/** Helpers for the admin-chat alert tests (community-alerts*.test.ts). */

export const LINK = "https://t.me/c/1234567890/42";

/** A routine action alert about member 101 in the community group; `extra` overrides any field. */
export const alertOf = (extra: Partial<AdminAlert> = {}): AdminAlert => ({
  chat: GROUP_ID,
  kind: "action",
  category: "unknown_link",
  member: { id: 101, name: "Sam", username: "sam", since: null },
  excerpt: "check my site",
  link: LINK,
  done: "Removed the message",
  aiGuess: null,
  undo: "warn",
  messageId: 42,
  routine: true,
  urgent: false,
  ...extra,
});

/** Lets the sends that alert() starts without waiting finish. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Alerts over a recorder and in-memory records, on a clock the test moves with at(). */
export function setupAlerts(title = "tonkfun.fun community") {
  let clock = NOW;
  const out = recordOut();
  const records = memoryRecords();
  const alerts = createAlerts({ out, records, adminChat: ADMIN_CHAT_ID, words: testWords, now: () => clock, groupTitle: () => title });
  const sends = () => callsOf(out.log, "send").map(([chat, html, options]) => ({ chat, html: html as string, options: options as SendOptions }));
  const raise = async (...list: AdminAlert[]) => {
    for (const a of list) alerts.alert(a);
    await settle();
  };
  return { alerts, records, sends, raise, at: (t: number) => (clock = t) };
}

/** A keyboard as "url:<address>" and "<label>=<data>" strings, row by row. */
export const buttons = (keyboard: InlineKeyboard | undefined) =>
  (keyboard?.inline_keyboard ?? []).map((row) => row.map((b) => ("url" in b ? `url:${b.url}` : `${b.text}=${b.callback_data}`)));
