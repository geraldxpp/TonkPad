import type { AiLimits } from "../src/telegram/claude/types";
import { createReports } from "../src/telegram/community/report";
import type { AdminAlert, AlertSink } from "../src/telegram/community/types";
import type { TgChat, TgMessage, TgUser } from "../src/telegram/types";
import { adminInfo, callsOf, fakeAdmins, GROUP_ID, groupMessage, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";

/** The /report test bench (community-report*.test.ts): a reporter, a spammer, an admin, and report limits that count. */

export const REPORTER: TgUser = { id: 301, is_bot: false, first_name: "Rae", last_name: "Porter", username: "rae_p", language_code: "en" };
export const SPAMMER: TgUser = { id: 302, is_bot: false, first_name: "Spam", username: "free_coins" };
export const ADMIN: TgUser = { id: 303, is_bot: false, first_name: "Ada" };
export const PRIVATE: TgChat = { id: REPORTER.id, type: "private" };
/** A valid 12-word recovery phrase (the BIP-39 test vector). */
export const SEED = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

/** Report limits that count, with no window: past `max` a person is refused. */
export function countingLimits(max = 3): AiLimits {
  const used = new Map<number, number>();
  return {
    answer: () => "ok",
    proactive: () => true,
    triage: () => true,
    report(user) {
      const n = used.get(user) ?? 0;
      used.set(user, n + 1);
      return n < max;
    },
    press: () => true,
    coolDown: () => false,
    busyReply: () => true,
    prune: () => undefined,
  };
}

/** Reports over a recorder, in-memory records and a list of the alerts raised (or `alerts`, null for no admin chat). */
export function setup(options: { alerts?: AlertSink | null } = {}) {
  const out = recordOut();
  const records = memoryRecords();
  const alerts: AdminAlert[] = [];
  const sink: AlertSink | null = options.alerts === undefined ? { alert: (a) => void alerts.push(a) } : options.alerts;
  const reports = createReports({ out, records, admins: fakeAdmins({ [GROUP_ID]: [adminInfo(ADMIN.id)] }), limits: countingLimits(), alerts: sink, words: () => testWords, now: () => NOW });
  return { out, records, alerts, reports };
}

/** A group /report from the reporter, replying to `replyTo`. */
export const report = (replyTo: TgMessage | undefined, extra: Partial<TgMessage> = {}) => groupMessage("/report", { from: REPORTER, reply_to_message: replyTo, ...extra });
export const spam = () => groupMessage("Free coins at claim-tonkfun.xyz, DM me", { from: SPAMMER });
export const sends = (out: ReturnType<typeof recordOut>) => callsOf(out.log, "send");
