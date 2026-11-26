import { createAiLimits } from "../src/telegram/claude/limits";
import { DEFAULT_ANSWER_MODEL } from "../src/telegram/claude/types";
import type { CommunityConfig } from "../src/telegram/community/config";
import { buildCommunity } from "../src/telegram/community/index-build";
import { startHooks } from "../src/telegram/community/index-hooks";
import type { AdminAlert } from "../src/telegram/community/types";
import type { TgChat, TgMessage, TgUpdate } from "../src/telegram/types";
import { fakeData, OFFICIAL, packSource } from "./agent-answer-fixtures";
import { ADMIN_CHAT_ID, adminInfo, fakeAdmins, GROUP_ID, MEMBER, memoryRecords, openBudget, OWNER_ID, recordOut, testWords } from "./community-fixtures";
import { answer, ME, scripted, SITE, verdict } from "./community-pipeline-fixtures";
import { NOW } from "./fixtures";
import { ALLOW } from "./mod-rules-fixtures";
import { context, spyHooks, stubHooks } from "./telegram-fixtures";

/** The team's admin chat, as the router tests' community agent knows it. */
export const ADMIN_CHAT: TgChat = { id: ADMIN_CHAT_ID, type: "supergroup", title: "Team" };
export const DATE = Math.floor(NOW / 1000);
let nextMessage = 50_000;

/** MEMBER's message in `chat`, sent at NOW. */
export function message(text: string | undefined, chat: TgChat, extra: Partial<TgMessage> = {}): TgUpdate {
  nextMessage += 1;
  return { update_id: nextMessage, message: { message_id: nextMessage, date: DATE, chat, from: MEMBER, text, ...extra } };
}

/** A router whose community agent (stubHooks) owns GROUP and the admin chat, every hook call recorded. */
export function routed(o: { ai?: boolean; routed?: "handled" | "pass" } = {}) {
  const spy = spyHooks(stubHooks({ groups: [GROUP_ID], adminChat: ADMIN_CHAT.id, ...o }));
  const logs: string[] = [];
  const { ctx, got } = context({}, NOW, { community: spy.hooks, log: (line) => void logs.push(line) });
  return { ctx, got, spy, logs };
}

/**
 * The router's view of a whole community agent: built as community/index.ts
 * builds it (buildCommunity, then startHooks) from the shared fakes, with a
 * Claude client that answers every check and every answer, so its calls show
 * whether anything reached the model. Nothing touches the network; stop() it
 * after the test (its timers are unref'd).
 */
export function liveCommunity() {
  const now = () => NOW;
  const out = recordOut();
  const records = memoryRecords({ strictness: "normal" });
  const client = scripted({ triage: verdict(), answer: answer() });
  const budget = openBudget();
  const limits = createAiLimits();
  const admins = fakeAdmins({ [GROUP_ID]: [adminInfo(7_002)] }, [OWNER_ID]);
  const alerts: AdminAlert[] = [];
  const sink = { alert: (a: AdminAlert) => void alerts.push(a), tick: async () => undefined };
  const pack = packSource();
  const logs: string[] = [];
  const log = (line: string) => void logs.push(line);
  const config: CommunityConfig = {
    apiKey: "test-key-0123456789abcdef", chats: [GROUP_ID], adminChat: ADMIN_CHAT_ID, owners: [OWNER_ID], adminLang: "en", groupLang: "en", mode: "normal",
    budgetUsd: 3, answerModel: DEFAULT_ANSWER_MODEL, privateAi: true, userCodeKey: "a".repeat(64), allowedDomains: [], allowedBots: [], officialX: ["tonkfun"],
    helplineUrl: "https://findahelpline.com/", statePath: "/nowhere/community.json",
  };
  const community = buildCommunity({
    config, chats: [GROUP_ID], out, records, client, budget, limits, admins, alerts: sink, pack, data: fakeData(), official: OFFICIAL, allow: ALLOW, me: () => ME,
    teamChat: () => false, discussion: () => false, title: () => "tonkfun.fun community", rights: () => ({ delete: true, restrict: true }),
    prompt: async () => undefined, site: SITE, now, log, words: () => testWords,
  });
  const hooks = startHooks({
    community, out: { ...out, tick: async () => undefined, stop: () => undefined }, records, store: { save: async () => undefined, stop: () => undefined },
    admins, limits, client, budget, pack, alerts: sink, watch: null, adminChat: ADMIN_CHAT_ID, privateAi: true,
    readRights: async () => undefined, now, log,
  });
  return { hooks, client, out, alerts, logs };
}

/** Lets queued jobs, model calls and moderation finish (real timers; nothing waits). */
export async function settle(): Promise<void> {
  for (let i = 0; i < 25; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

let nextUpdate = 10_000;

/** One update of each kind a group can send, all from MEMBER in `chat`, sent at NOW. */
export function groupUpdates(chat: TgChat): Record<"plain" | "mention" | "ask" | "edit" | "join" | "press" | "askPress", TgUpdate> {
  const id = () => (nextUpdate += 1);
  const date = Math.floor(NOW / 1000);
  const message = (text: string, extra: Partial<TgMessage> = {}): TgMessage => ({ message_id: id(), date, chat, from: MEMBER, text, ...extra });
  const mention = message("@TonkfunBot what is the protocol fee on a curve trade?", { entities: [{ type: "mention", offset: 0, length: 11 }] });
  const buttoned = (data: string): TgMessage => ({ message_id: id(), date, chat, from: { id: ME.id, is_bot: true, username: "TonkfunBot" }, text: "A check", reply_markup: { inline_keyboard: [[{ text: "Press", callback_data: data }]] } });
  const member = { status: "member" as const, user: MEMBER };
  return {
    plain: { update_id: id(), message: message("gm everyone, how is the protocol fee shared on tonkfun.fun?") },
    mention: { update_id: id(), message: mention },
    ask: { update_id: id(), message: message("/ask@TonkfunBot what is the launch fee?") },
    edit: { update_id: id(), edited_message: { ...mention, text: "@TonkfunBot is the fee 0%?", edit_date: date + 30 } },
    join: { update_id: id(), chat_member: { chat, from: MEMBER, date, old_chat_member: { status: "left", user: MEMBER }, new_chat_member: member } },
    press: { update_id: id(), callback_query: { id: `q${id()}`, from: MEMBER, data: `h:${MEMBER.id}:1`, message: buttoned(`h:${MEMBER.id}:1`) } },
    askPress: { update_id: id(), callback_query: { id: `q${id()}`, from: MEMBER, data: "askp", message: buttoned("askp") } },
  };
}
