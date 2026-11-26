import type { CommunityHooks } from "../src/telegram/community/types";
import type { BotContext } from "../src/telegram/context";
import { BOT_DICTIONARIES } from "../src/telegram/i18n";
import { askResultId, inlineLimits } from "../src/telegram/inline";
import { PendingAsks } from "../src/telegram/inline-pending";
import type { Later } from "../src/telegram/inline-wait";
import { handleUpdate } from "../src/telegram/router";
import type { TgChat, TgMessage, TgUpdate, TgUser } from "../src/telegram/types";
import { ADMIN_CHAT_ID, BOT, GROUP, GROUP_ID, MEMBER } from "./community-fixtures";
import { harness, type HarnessOptions, ME } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { context, stubHooks } from "./telegram-fixtures";

/**
 * The inline tests' queries, chosen results, Ask posts and bots
 * (telegram-inline-*.test.ts): inline mode's Ask result (inline.ts,
 * inline-ask.ts) and its pairing (inline-pending.ts) as the router meets them.
 */

/** Where an inline query can be typed: the bot's own chat, a basic group, a supergroup, a channel, a chat with someone else, a secret chat (no type). */
export const CHAT_TYPES = ["sender", "group", "supergroup", "channel", "private", null] as const;
/** What Ask posts, in English: the line, never the question. */
export const ASK_LINE = BOT_DICTIONARIES.en.inline.askPosted;
/** The Ask result's ID as offered in a supergroup ("ask:g"), and in the bot's own chat ("ask:p"). */
export const ASK_G = askResultId("g");
export const ASK_P = askResultId("p");
/** The bot's own chat with MEMBER. */
export const PRIVATE: TgChat = { id: MEMBER.id, type: "private" };

let nextId = 1;
/** An inline query typed in a chat of `chatType` (none from a secret chat), by MEMBER in `lang`, or by `from` (an ID, or a user with a name). */
export function query(text: string, chatType: string | null = "supergroup", lang = "en", from: number | { id: number; first_name?: string; username?: string } = MEMBER.id): TgUpdate {
  nextId += 1;
  const user = typeof from === "number" ? { id: from } : from;
  return { update_id: nextId, inline_query: { id: `q${nextId}`, from: { ...user, language_code: lang }, query: text, ...(chatType ? { chat_type: chatType } : {}) } };
}

/** Telegram's word that `from` chose the result `resultId` (Ask's as offered in a supergroup unless given) for `text`. */
export function chosen(text: string, from: TgUser = MEMBER, resultId = ASK_G): TgUpdate {
  nextId += 1;
  return { update_id: nextId, chosen_inline_result: { result_id: resultId, from, query: text } };
}

/** The line the Ask result posts in `chat`, as `from`'s own message via the bot, sent at NOW unless `extra` says otherwise. */
export function askPost(chat: TgChat = GROUP, extra: Partial<TgMessage> = {}, from: TgUser = MEMBER): TgUpdate {
  nextId += 1;
  return { update_id: nextId, message: { message_id: 80_000 + nextId, date: Math.floor(NOW / 1000), chat, from, text: ASK_LINE, via_bot: BOT, ...extra } };
}

/** A bot whose community agent answers with AI in private chats and in its groups (stubHooks: nothing reaches a model). */
export const asking = (extra: Partial<BotContext> = {}) => context({}, NOW, { community: stubHooks(), ...extra });

/** A clock whose timers the test runs: `later` for InlineTyping and PendingAsks; pass(ms) moves it on, running what falls due in order and letting each finish. */
export function testClock() {
  let clock = NOW;
  const timers: Array<{ at: number; run: () => void; off: boolean }> = [];
  const later: Later = (run, ms) => {
    const timer = { at: clock + ms, run, off: false };
    timers.push(timer);
    return () => void (timer.off = true);
  };
  const due = (end: number) => timers.filter((t) => !t.off && t.at <= end).sort((a, b) => a.at - b.at)[0];
  const pass = async (ms: number) => {
    const end = clock + ms;
    for (let next = due(end); next; next = due(end)) {
      next.off = true;
      clock = next.at;
      next.run();
      await new Promise((resolve) => setImmediate(resolve));
    }
    clock = end;
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { now: () => clock, later, pass };
}

/** `asking` at the production limits (inlineLimits, its pauses on a testClock): send() types each query `gap` ms after the last, by `from`; pass() lets time pass. */
export function production() {
  const time = testClock();
  const run = asking({ ...inlineLimits(time.later), now: time.now });
  const send = async (texts: readonly string[], gap: number, chatType: string | null = "supergroup", from = MEMBER.id) => {
    for (const text of texts) {
      await handleUpdate(query(text, chatType, "en", from), run.ctx);
      await time.pass(gap);
    }
  };
  return { ...run, ...time, send };
}

/** What one query typed in `chatType` by `from` gets from a fresh `asking` bot: its results and its button's text. */
export async function answerTo(text: string, chatType: string | null = "supergroup", from: Parameters<typeof query>[3] = MEMBER.id) {
  const { ctx, got } = asking();
  await handleUpdate(query(text, chatType, "en", from), ctx);
  return got.inline[0];
}

/**
 * A whole community agent (community-pipeline-fixtures harness, which owns
 * GROUP) behind the router, with Ask's pending store and the router's clock
 * on a testClock: send() routes an update, pass() lets time pass (the 5 s a
 * post waits for its question, a question's 60 s).
 */
export function pairing(options: HarnessOptions & { ai?: boolean; store?: boolean } = {}) {
  const h = harness(options);
  const time = testClock();
  const ai = options.ai ?? true;
  const hooks: CommunityHooks = {
    ...stubHooks({ groups: [GROUP_ID], adminChat: ADMIN_CHAT_ID, ai }),
    groupAi: () => ai,
    onMessage: (m, stale) => h.community.pipeline.onMessage(m, stale),
    askPrivate: (m, question) => h.community.qa.askPrivate(m, question),
    offerPrivate: (m, text) => h.community.qa.offerPrivate(m, text),
  };
  const store = options.store === false ? undefined : new PendingAsks(time.later);
  const logs: string[] = [];
  const bot = context({}, NOW, { community: hooks, me: () => ME, bot: () => "TonkfunBot", now: time.now, pendingAsks: store, log: (line) => void logs.push(line) });
  const send = async (update: TgUpdate) => {
    await handleUpdate(update, bot.ctx);
    await time.pass(0);
  };
  return { h, ...bot, store, time, logs, send, pass: time.pass };
}
