import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { Locale } from "@/shared/i18n/config";
import { ANSWER_MODELS, type AnswerModel, DEFAULT_ANSWER_MODEL } from "../claude/types";
import { dollars, domains, flag, handles, httpsUrl, ids, locale, oneOf, text } from "./config-parse";
import { type ChatId, STRICTNESS_LEVELS, type Strictness, type UserId } from "./types";

export interface CommunityConfig {
  /** Anthropic's key; null when no model call may run (no usable key, or a daily budget of 0). */
  apiKey: string | null;
  /** The allow-listed community supergroups; empty unless an admin chat and an owner are set. */
  chats: ChatId[];
  /** The team's private admin group (a basic group's ID is accepted too), or null. */
  adminChat: ChatId | null;
  /** With each group's creator, the only people who change modes and AI settings. */
  owners: UserId[];
  /** Alerts and the admin panel. */
  adminLang: Locale;
  /** Notices to a whole group. */
  groupLang: Locale;
  /** The strictness a group starts in. */
  mode: Strictness;
  /** The day's AI cap in dollars; 0 means AI off. */
  budgetUsd: number;
  /** The model answers run on (TELEGRAM_AI_ANSWER_MODEL); moderation checks always run on claude/types.ts's TRIAGE_MODEL. */
  answerModel: AnswerModel;
  /** AI answers in private chats: on unless TELEGRAM_AI_PRIVATE is off, and only when AI can run. */
  privateAi: boolean;
  /** Keys the pseudonymous metadata.user_id; derived from the bot token, so no new secret. Null when the code is off or AI can't run. */
  userCodeKey: string | null;
  /** More hosts members may link to: lower case, Unicode form, no "www.". */
  allowedDomains: string[];
  /** Bot usernames non-admins may add: lower case, no @. */
  allowedBots: string[];
  /** The official X handles members may link to: lower case, no @. */
  officialX: string[];
  /** Where the crisis reply's button points. */
  helplineUrl: string;
  /** community.json, beside the snapshot unless set. */
  statePath: string;
}

export const DEFAULT_BUDGET_USD = 3;
export const DEFAULT_HELPLINE_URL = "https://findahelpline.com";

/** -100 then digits: a supergroup. */
const GROUP_ID = /^-100\d{5,13}$/;
const CHAT_ID = /^-\d{1,16}$/;
const USER_ID = /^\d{1,16}$/;
/** 5 to 32 characters, ending in "bot". */
const BOT_NAME = /^[A-Za-z][A-Za-z0-9_]{1,28}bot$/i;
const X_HANDLE = /^\w{5,15}$/;
/** Printable, without spaces or quotes: what a pasted key looks like once trimmed. */
const API_KEY = /^[\x21\x23-\x26\x28-\x7E]{20,500}$/;

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** TELEGRAM_AI_ANSWER_MODEL, any case: one of ANSWER_MODELS, else the default, with a note for any other value. */
export const answerModelOf = (value: string | undefined, notes: string[]): AnswerModel =>
  oneOf(text(value), ANSWER_MODELS, DEFAULT_ANSWER_MODEL, "TELEGRAM_AI_ANSWER_MODEL", notes);

/**
 * The community agent's settings from the worker's environment
 * (prompts/15-community-agent.md, Environment variables). It is off unless
 * TELEGRAM_COMMUNITY_CHATS or ANTHROPIC_API_KEY is set. Community groups
 * need TELEGRAM_ADMIN_CHAT_ID and at least one TELEGRAM_OWNER_IDS entry;
 * without them the groups are ignored, and a key alone gives AI in private
 * chats only. A value it can't use is ignored with a note, and the AI
 * switches fail closed. The note is one log line saying what runs and what
 * was ignored: it holds counts, never an ID, key or token.
 */
export function loadCommunityConfig(env: Readonly<Record<string, string | undefined>>, snapshotPath: string): { config: CommunityConfig | null; note: string } {
  const rawChats = text(env.TELEGRAM_COMMUNITY_CHATS);
  const rawKey = text(env.ANTHROPIC_API_KEY);
  if (!rawChats && !rawKey) return { config: null, note: "community off: neither TELEGRAM_COMMUNITY_CHATS nor ANTHROPIC_API_KEY is set" };
  const notes: string[] = [];

  const budgetUsd = dollars(text(env.TELEGRAM_AI_BUDGET_USD), "TELEGRAM_AI_BUDGET_USD", DEFAULT_BUDGET_USD, notes);
  const key = rawKey && API_KEY.test(rawKey) ? rawKey : null;
  if (rawKey && !key) notes.push("ANTHROPIC_API_KEY ignored (it doesn't look like an API key)");
  const apiKey = budgetUsd > 0 ? key : null;
  const aiOff = !key ? "no usable ANTHROPIC_API_KEY" : budgetUsd === 0 ? "the daily budget is 0" : null;
  const privateAi = flag(text(env.TELEGRAM_AI_PRIVATE), "TELEGRAM_AI_PRIVATE", true, notes) && apiKey !== null;
  const userCode = flag(text(env.TELEGRAM_AI_USER_CODE), "TELEGRAM_AI_USER_CODE", true, notes);
  const token = text(env.TELEGRAM_BOT_TOKEN);
  const userCodeKey = userCode && apiKey && token ? createHash("sha256").update(`tonkfun user code:${token}`).digest("hex") : null;

  const owners = ids(text(env.TELEGRAM_OWNER_IDS), "TELEGRAM_OWNER_IDS", USER_ID, "a Telegram user ID", notes);
  const adminChats = ids(text(env.TELEGRAM_ADMIN_CHAT_ID), "TELEGRAM_ADMIN_CHAT_ID", CHAT_ID, "a negative chat ID", notes);
  if (adminChats.length > 1) notes.push("TELEGRAM_ADMIN_CHAT_ID ignored (one chat ID)");
  let adminChat: ChatId | null = adminChats.length === 1 ? adminChats[0] : null;
  let chats = ids(rawChats, "TELEGRAM_COMMUNITY_CHATS", GROUP_ID, "a supergroup ID (-100…)", notes);
  if (adminChat !== null && chats.includes(adminChat)) {
    // Alerts carry names and excerpts: they must never land in a community group.
    notes.push("TELEGRAM_ADMIN_CHAT_ID is one of TELEGRAM_COMMUNITY_CHATS, so both are ignored (the admin chat must be the team's own group)");
    adminChat = null;
    chats = [];
  }
  const missing = [adminChat === null ? "TELEGRAM_ADMIN_CHAT_ID" : "", owners.length === 0 ? "TELEGRAM_OWNER_IDS" : ""].filter(Boolean);
  if (chats.length > 0 && missing.length > 0) {
    notes.push(`TELEGRAM_COMMUNITY_CHATS ignored: community groups need ${missing.join(" and ")}`);
    chats = [];
  }

  const rest = notes.length > 0 ? `; ${notes.join("; ")}` : "";
  if (chats.length === 0 && !privateAi) {
    const why = apiKey ? "private AI is off" : `AI is off (${aiOff})`;
    return { config: null, note: `community off: no community groups to run, and ${why}${rest}` };
  }

  const config: CommunityConfig = {
    apiKey,
    chats,
    adminChat,
    owners,
    adminLang: locale(text(env.TELEGRAM_ADMIN_LANG), "TELEGRAM_ADMIN_LANG", notes),
    groupLang: locale(text(env.TELEGRAM_COMMUNITY_LANG), "TELEGRAM_COMMUNITY_LANG", notes),
    mode: oneOf(text(env.TELEGRAM_COMMUNITY_MODE), STRICTNESS_LEVELS, "observe", "TELEGRAM_COMMUNITY_MODE", notes),
    budgetUsd,
    answerModel: answerModelOf(env.TELEGRAM_AI_ANSWER_MODEL, notes),
    privateAi,
    userCodeKey,
    allowedDomains: domains(text(env.TELEGRAM_ALLOWED_DOMAINS), "TELEGRAM_ALLOWED_DOMAINS", notes),
    allowedBots: handles(text(env.TELEGRAM_ALLOWED_BOTS), "TELEGRAM_ALLOWED_BOTS", BOT_NAME, "a bot username ending in bot", notes),
    officialX: handles(text(env.TELEGRAM_OFFICIAL_X), "TELEGRAM_OFFICIAL_X", X_HANDLE, "an X handle (5 to 15 letters, digits or _)", notes),
    helplineUrl: httpsUrl(text(env.TELEGRAM_HELPLINE_URL), "TELEGRAM_HELPLINE_URL", DEFAULT_HELPLINE_URL, notes),
    statePath: text(env.TELEGRAM_COMMUNITY_STATE_PATH) ?? join(dirname(snapshotPath), "community.json"),
  };
  const where = [chats.length > 0 ? "groups" : "", privateAi ? "private chats" : ""].filter(Boolean).join(" and ");
  const ai = apiKey ? `AI on in ${where}, up to $${budgetUsd} a day, answers on ${config.answerModel}${userCodeKey ? "" : ", without the user code"}` : `AI off (${aiOff})`;
  const groups = chats.length > 0 ? `${count(chats.length, "group")}, mode ${config.mode}` : "no community groups";
  const head = `community on: ${groups}, admin chat ${adminChat === null ? "not set" : "set"}, ${count(owners.length, "owner")}; ${ai}`;
  return { config, note: notes.length > 0 ? `${head}; ${notes.join("; ")}` : head };
}
