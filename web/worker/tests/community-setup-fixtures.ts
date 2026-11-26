import type { SetupDeps } from "../src/telegram/community/setup";
import type { AdminAlert } from "../src/telegram/community/types";
import type { TgChatFull, TgChatMember } from "../src/telegram/types";
import { ADMIN_CHAT_ID, BOT_ID, GROUP_ID, OWNER_ID, recordOut, testWords } from "./community-fixtures";

/** The setup checks' fakes: who holds which place in each chat, and getChat's answers. Nothing touches the network. */

export const SECOND_GROUP = -1_001_111_111_111;
const FULL: Partial<TgChatMember> = { status: "administrator", can_delete_messages: true, can_restrict_members: true };
/** The admin chat's auto-delete timer as the brief asks: a week. */
export const WEEK_S = 7 * 24 * 60 * 60;

/** getChat's answer as the tests give it: the auto-delete timer (seconds) included. */
export type ChatAnswer = Partial<TgChatFull> & { message_auto_delete_time?: number };

/** Each chat's people as getChatMember gives them (anyone unlisted is a plain member; null: Telegram can't say). */
export type Places = Record<number, Record<number, Partial<TgChatMember> | null>>;
export const READY: Places = {
  [GROUP_ID]: { [OWNER_ID]: { status: "creator" }, [BOT_ID]: FULL },
  [SECOND_GROUP]: { [OWNER_ID]: { status: "administrator", can_restrict_members: true }, [BOT_ID]: FULL },
  [ADMIN_CHAT_ID]: { [OWNER_ID]: { status: "member" } },
};

/** One chat's or one person's place changed from READY. */
export const but = (chat: number, user: number, place: Partial<TgChatMember> | null): Places => ({ ...READY, [chat]: { ...READY[chat], [user]: place } });

/**
 * checkSetup's dependencies over a recorder, with no waits between tries;
 * `chats` overrides what getChat says (null: it can't be read). The admin
 * chat deletes after a week unless `chats` says otherwise.
 */
export function bench(places: Places = READY, options: { chats?: Record<number, ChatAnswer | null>; extra?: Partial<SetupDeps> } = {}) {
  const alerts: AdminAlert[] = [];
  const waits: number[] = [];
  const out = recordOut({
    member: async (chat, user) => {
      const place = places[chat]?.[user];
      return place === null ? null : { status: "member", user: { id: user }, ...place };
    },
    chat: async (chat) => {
      const given = options.chats?.[chat];
      if (given === null) return null;
      const admin: ChatAnswer = chat === ADMIN_CHAT_ID ? { title: "Team", message_auto_delete_time: WEEK_S } : { title: "tonkfun.fun community" };
      const answer: ChatAnswer & TgChatFull = { id: chat, type: "supergroup", ...admin, ...given };
      return answer;
    },
  });
  const deps: SetupDeps = {
    out, chats: [GROUP_ID, SECOND_GROUP], adminChat: ADMIN_CHAT_ID, owners: [OWNER_ID], botId: BOT_ID, contact: "set",
    alerts: { alert: (a) => void alerts.push(a) }, words: testWords, sleep: async (ms) => void waits.push(ms), ...options.extra,
  };
  return { deps, out, alerts, waits };
}
