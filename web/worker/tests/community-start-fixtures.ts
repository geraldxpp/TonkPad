import { join } from "node:path";
import { TokenStore } from "../src/store";
import { type BotApi, TelegramError } from "../src/telegram/api";
import { type CommunityDeps, startCommunity } from "../src/telegram/community/index";
import { watchFailures } from "../src/telegram/community/setup-status";
import type { CommunityHooks } from "../src/telegram/community/types";
import { Sender } from "../src/telegram/sender";
import { ADMIN_CHAT_ID, BOT_ID, fakeClaude, GROUP_ID, OWNER_ID } from "./community-fixtures";
import { NOW } from "./fixtures";

export const SECOND_GROUP = -1_001_111_111_111;
export const SITE = "https://www.tonkfun.fun";
export const KEY = `sk-ant-api03-${"x".repeat(40)}`;
export const FACTS = { v: 1, hash: "b".repeat(64), inviteOnly: false, contact: { kind: "email", text: "security@tonkfun.fun", href: "mailto:security@tonkfun.fun" } };
/** The admin chat's auto-delete timer as the brief asks: a week, in seconds. */
export const WEEK_S = 7 * 24 * 60 * 60;

export type Answer = (params: Record<string, unknown>) => unknown;
export const user = (id: number) => ({ id, is_bot: id === BOT_ID, first_name: id === OWNER_ID ? "Owner" : "Someone" });
export const FULL_RIGHTS = { status: "administrator", can_delete_messages: true, can_restrict_members: true };

/** Telegram when everything is set up: a private admin chat with the owner in it and a week's auto-delete, groups the owner created, the bot an admin with both rights. */
export const READY: Record<string, Answer> = {
  getChat: (p) =>
    p.chat_id === ADMIN_CHAT_ID
      ? { id: ADMIN_CHAT_ID, type: "supergroup", title: "Team", message_auto_delete_time: WEEK_S }
      : { id: p.chat_id, type: "supergroup", title: "tonkfun.fun community", username: "tonkfun_chat" },
  getChatMember: (p) => {
    if (p.user_id === BOT_ID) return { ...FULL_RIGHTS, user: user(BOT_ID) };
    if (p.user_id === OWNER_ID) return { status: p.chat_id === ADMIN_CHAT_ID ? "member" : "creator", user: user(OWNER_ID) };
    return { status: "member", user: user(Number(p.user_id)) };
  },
  getChatAdministrators: () => [{ status: "creator", user: user(OWNER_ID) }, { ...FULL_RIGHTS, user: user(BOT_ID) }],
  getChatMemberCount: () => 3,
  sendMessage: (p) => ({ message_id: 1, date: Math.floor(NOW / 1000), chat: { id: p.chat_id, type: "supergroup" } }),
};

/** One call as Telegram got it. */
export interface Call {
  method: string;
  params: Record<string, unknown>;
}

/** Telegram's Bot API as a fake: each method's scripted answer (a thrown TelegramError is Telegram refusing it), or a 400. */
export function fakeApi(answers: Record<string, Answer>): BotApi & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      calls.push({ method, params });
      const answer = answers[method];
      if (!answer) throw new TelegramError(400, "Bad Request: not scripted", null);
      return answer(params) as T;
    },
  };
}

/** A 502 from Telegram, as when it is briefly down. */
export const badGateway = () => new TelegramError(502, "Bad Gateway", null);

/**
 * startCommunity over the fake API and a fake Claude client, its files in
 * `dir`, on a clock tests may move (`clock.now`), with every wait instant.
 * The setup checks see Telegram's failures through the failure watch under
 * the Sender, as in telegram/index.ts. Nothing touches the network.
 */
export function startBench(dir: string, options: { env?: Record<string, string>; telegram?: Record<string, Answer>; facts?: unknown; onChange?: () => void } = {}) {
  const logs: string[] = [];
  const clock = { now: NOW };
  let senderClock = NOW;
  const api = fakeApi({ ...READY, ...options.telegram });
  const watched = watchFailures(api);
  const fetchFn = async (input: RequestInfo | URL): Promise<Response> =>
    String(input) === `${SITE}/api/bot/site` ? new Response(JSON.stringify(options.facts ?? FACTS), { status: 200 }) : new Response("", { status: 404 });
  const env = {
    TELEGRAM_BOT_TOKEN: `123456:${"A".repeat(35)}`, ANTHROPIC_API_KEY: KEY, TELEGRAM_COMMUNITY_CHATS: String(GROUP_ID), TELEGRAM_ADMIN_CHAT_ID: String(ADMIN_CHAT_ID),
    TELEGRAM_OWNER_IDS: String(OWNER_ID), TELEGRAM_COMMUNITY_STATE_PATH: join(dir, "community.json"), ...options.env,
  };
  const deps: CommunityDeps = {
    // The Sender's waits move its own clock, so its 25 a second never stall a test (a fixed clock would wait forever).
    env, snapshotPath: join(dir, "snapshot.json"), sender: new Sender(watched.api, (line) => void logs.push(line), () => senderClock, async (ms) => void (senderClock += ms)), site: SITE,
    store: new TokenStore(), ethUsd: () => 3_000, me: () => ({ id: BOT_ID, usernames: ["TonkfunBot"] }), channel: "@tonkfun_launches", brandCreators: new Set(),
    log: (line) => void logs.push(line), now: () => clock.now, fetchFn, client: fakeClaude([]), sleep: async () => undefined, onChange: options.onChange, failures: watched.watch,
  };
  let started: CommunityHooks | null = null;
  const start = async () => (started = await startCommunity(deps));
  return { deps, api, logs, clock, start, stop: () => started?.stop() };
}

/** The texts Telegram was asked to send to one chat, in order. */
export const sentTo = (calls: readonly Call[], chat: number) => calls.filter((c) => c.method === "sendMessage" && c.params.chat_id === chat).map((c) => String(c.params.text));
