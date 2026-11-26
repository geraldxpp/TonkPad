import type { AnswerOutput } from "../src/telegram/agent/types";
import { createAiLimits } from "../src/telegram/claude/limits";
import { type AnswerModel, type ClaudeClient, type ClaudeOutcome, type ClaudeRequest, DEFAULT_ANSWER_MODEL } from "../src/telegram/claude/types";
import type { CommunityConfig } from "../src/telegram/community/config";
import { buildCommunity } from "../src/telegram/community/index-build";
import type { CommunityOut } from "../src/telegram/community/out";
import type { AdminAlert, AdminInfo, ChatSettings, Strictness, TriageVerdict } from "../src/telegram/community/types";
import type { TgChat, TgMessage, TgUser, View } from "../src/telegram/types";
import { answerJson, endTurn, fakeData, OFFICIAL, packSource } from "./agent-answer-fixtures";
import {
  ADMIN_CHAT_ID, adminInfo, BOT_ID, callsOf, failure, fakeAdmins, fakeClaude, GROUP, GROUP_ID, groupMessage, memoryRecords, ok, openBudget, OWNER_ID,
  recordOut, type ScriptStep, testWords,
} from "./community-fixtures";
import { NOW } from "./fixtures";
import { ALLOW } from "./mod-rules-fixtures";
import { VALID, verdictReply } from "./mod-triage-fixtures";

/**
 * A whole community agent built as community/index.ts builds it, from the
 * shared fakes (recordOut, memoryRecords, fakeClaude, openBudget,
 * fakeAdmins) and the placeholder words: nothing touches the network.
 */

export const SITE = "https://www.tonkfun.fun";
export const ADMIN_ID = 7_002;
export const ME = { id: BOT_ID, usernames: ["TonkfunBot"] };
export const S = 1_000;
export const MINUTE = 60 * S;
export const HOUR = 60 * MINUTE;
export const FORUM: TgChat = { ...GROUP, is_forum: true };

export const person = (id: number, extra: Partial<TgUser> = {}): TgUser => ({ id, is_bot: false, first_name: `Member${id}`, language_code: "en", ...extra });
export const ADMIN: TgUser = person(ADMIN_ID, { first_name: "Alex", last_name: "Admin" });

/** Haiku's check, as the schema asks for it: a question about tonkfun.fun unless patched. */
export const verdict = (patch: Partial<TriageVerdict> = {}): ClaudeOutcome => ok(verdictReply(JSON.stringify({ ...VALID, ...patch })));
/** An answer, as the schema asks for it: the protocol fee unless patched. */
export const answer = (patch: Partial<AnswerOutput> = {}): ClaudeOutcome => ok(endTurn(JSON.stringify(answerJson(patch))));

/** A client that answers checks and answers by their kind, as often as asked (an unscripted kind fails). */
export function scripted(by: { triage?: ClaudeOutcome; answer?: ClaudeOutcome } = {}, max = 80): ReturnType<typeof fakeClaude> {
  const step: ScriptStep = (request) => (request.kind === "triage" ? by.triage : by.answer) ?? failure("unknown");
  return fakeClaude(Array.from({ length: max }, () => step));
}

/** "@TonkfunBot <question>" with its mention entity, in the group unless `extra` says otherwise. */
export function mention(question: string, extra: Partial<TgMessage> = {}): TgMessage {
  return groupMessage(`@TonkfunBot ${question}`, { entities: [{ type: "mention", offset: 0, length: 11 }], ...extra });
}

export interface HarnessOptions {
  mode?: Strictness;
  settings?: Partial<ChatSettings>;
  /** Null: no key, so no model call at all. */
  client?: ClaudeClient | null;
  admins?: AdminInfo[];
  out?: Partial<CommunityOut>;
  /** The group is a channel's discussion group. */
  discussion?: boolean;
  privateAi?: boolean;
  /** The model answers run on: the bot's default (Sonnet 5.5) unless given. */
  answerModel?: AnswerModel;
}

export function harness(options: HarnessOptions = {}) {
  const clock = { now: NOW };
  const now = () => clock.now;
  const out = recordOut(options.out);
  const records = memoryRecords({ strictness: options.mode ?? "normal", ...options.settings });
  const given = options.client === undefined ? scripted() : options.client;
  /** Every request sent to the model, whatever client the test gave. */
  const calls: ClaudeRequest[] = [];
  const client: ClaudeClient | null = given ? { create: (request) => (calls.push(request), given.create(request)), countTokens: (params) => given.countTokens(params) } : null;
  const budget = client ? openBudget() : null;
  const alerts: AdminAlert[] = [];
  const logs: string[] = [];
  const prompts: Array<{ chat: number; view: View }> = [];
  const config: CommunityConfig = {
    apiKey: client ? "test-key-0123456789abcdef" : null, chats: [GROUP_ID], adminChat: ADMIN_CHAT_ID, owners: [OWNER_ID], adminLang: "en", groupLang: "en",
    mode: options.mode ?? "normal", budgetUsd: 3, answerModel: options.answerModel ?? DEFAULT_ANSWER_MODEL, privateAi: options.privateAi ?? true, userCodeKey: "a".repeat(64), allowedDomains: [], allowedBots: [],
    officialX: ["tonkfun"], helplineUrl: "https://findahelpline.com/", statePath: "/nowhere/community.json",
  };
  const community = buildCommunity({
    config, chats: [GROUP_ID], out, records, client, budget, limits: createAiLimits(), admins: fakeAdmins({ [GROUP_ID]: options.admins ?? [adminInfo(ADMIN_ID)] }, [OWNER_ID]),
    alerts: { alert: (a) => void alerts.push(a), tick: async () => undefined }, pack: packSource(), data: fakeData(), official: OFFICIAL, allow: ALLOW, me: () => ME,
    teamChat: () => false, discussion: () => options.discussion === true, title: () => "tonkfun.fun community", rights: () => ({ delete: true, restrict: true }),
    prompt: async (chat, view) => void prompts.push({ chat, view }), site: SITE, now, log: (line) => void logs.push(line), words: () => testWords,
  });
  return {
    clock, out, records, calls, budget, alerts, logs, prompts, community,
    /** The kinds of the model calls made, in order. */
    kinds: () => calls.map((c) => c.kind),
    /** A message into the pipeline, as the router hands it over. */
    send: (m: TgMessage, stale = false) => community.pipeline.onMessage(m, stale),
    sends: () => callsOf(out.log, "send") as Array<[number, string, { kind: string; replyTo?: number; thread?: number; keyboard?: { inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>> }; ephemeralTo?: number }]>,
    removed: () => callsOf(out.log, "remove").flatMap((c) => c[1] as number[]),
    tick: (at: number) => {
      clock.now = at;
      return community.pipeline.tick(at);
    },
  };
}

/** Lets queued jobs, model calls and moderation finish (real timers; nothing waits). */
export async function settle(): Promise<void> {
  for (let i = 0; i < 25; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** The member's recovery phrase: BIP-39's own test vector. */
export const SEED = "legal winner thank year wave sausage worth useful legal winner thank yellow";
export const DAY = 24 * HOUR;
export { ADMIN_CHAT_ID, GROUP, GROUP_ID, testWords };
