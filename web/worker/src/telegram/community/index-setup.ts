import { domainToUnicode } from "node:url";
import type { BudgetEvent } from "../claude/budget";
import type { BudgetStatus, CallKind, Lane } from "../claude/types";
import type { TgChatFull, View } from "../types";
import type { CommunityConfig } from "./config";
import { fillText } from "./controls-people";
import type { CommunityOut } from "./out";
import { createRecords } from "./records";
import { loadCommunityState, saveCommunityState } from "./state";
import type { AdminAlert, AllowList, ChatId, OfficialAccounts, Records } from "./types";
import type { CommunityDictionary } from "./words";

/**
 * What community/index.ts reads and writes as it starts: the records over
 * community.json, the groups and the channel as getChat shows them, the
 * official accounts and the allow-list for members' links, the budget's and
 * the knowledge pack's alerts, and the Ask prompt's send.
 */

/** Changes are saved at most every 2 seconds. */
const SAVE_DEBOUNCE_MS = 2_000;
/** The allow-list's own sites (decision 12); TELEGRAM_ALLOWED_DOMAINS adds more. */
const DEFAULT_DOMAINS: readonly string[] = ["tonkfun.fun", "tonk-pad.vercel.app", "robinhoodchain.blockscout.com", "solscan.io", "explorer.solana.com"];

/**
 * The records over community.json: loaded, pruned and written back at once
 * (before any check can turn community mode off), with every per-member
 * record of a group no longer in TELEGRAM_COMMUNITY_CHATS dropped, trusted
 * members included; then every change is saved within 2 seconds.
 * deletesLeft() counts the deletes it still holds, for the deleter that
 * outlives community mode (index-deleter.ts).
 */
export async function openStore(config: CommunityConfig, log: (line: string) => void, now: () => number): Promise<{ records: Records; save(): Promise<void>; stop(): void; deletesLeft(): number }> {
  const state = await loadCommunityState(config.statePath);
  let timer: ReturnType<typeof setTimeout> | null = null;
  // It rejects when the write fails; the error's message is never logged.
  const write = () => saveCommunityState(config.statePath, state).catch((error: unknown) => log(`community state not saved: ${error instanceof Error ? error.name : "error"}`));
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const persist = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void write();
    }, SAVE_DEBOUNCE_MS);
    timer.unref?.();
  };
  const records = createRecords(state, { persist, defaults: () => ({ paused: false, proactive: true, strictness: config.mode, raidUntil: 0 }), now });
  records.forgetChatsExcept(config.chats);
  records.prune(now());
  cancel();
  await write();
  return {
    records,
    async save() {
      cancel();
      await write();
    },
    stop: cancel,
    deletesLeft: () => state.deletes.length,
  };
}

/** A read that may be tried again when it fails (null). */
type Read = (load: () => Promise<TgChatFull | null>) => Promise<TgChatFull | null>;

/** A community group as getChat shows it: its title, public username and linked channel. */
export interface GroupInfo {
  title: string;
  username: string | null;
  /** The channel whose discussion group this is, or null. */
  linked: number | null;
}

/** A group's info from getChat's answer; empty without one. */
export function groupInfo(c: TgChatFull | null): GroupInfo {
  const linked = c?.linked_chat_id;
  return { title: c?.title ?? "", username: c?.username ?? null, linked: typeof linked === "number" && Number.isSafeInteger(linked) ? linked : null };
}

/** Reads the groups as getChat shows them; a failed read is tried again (`read`, setup.ts's retrying reader, unless given), and one that still failed is `unread`. */
export async function readGroups(out: CommunityOut, chats: readonly ChatId[], read: Read = (load) => load()): Promise<{ groups: Map<ChatId, GroupInfo>; unread: ChatId[] }> {
  const groups = new Map<ChatId, GroupInfo>();
  const unread: ChatId[] = [];
  for (const chat of chats) {
    const c = await read(() => out.chat(chat)).catch(() => null);
    if (!c) unread.push(chat);
    groups.set(chat, groupInfo(c));
  }
  return { groups, unread };
}

/**
 * Reads a group whose getChat failed at start again (setup-retry.ts): its
 * title, linked channel and public username apply at once, the username
 * among the official names members may link to as well. True once read.
 */
export function groupRereader(out: CommunityOut, groups: Map<ChatId, GroupInfo>, official: OfficialAccounts, allow: AllowList): (chat: ChatId) => Promise<boolean> {
  return async (chat) => {
    const c = await out.chat(chat).catch(() => null);
    if (!c) return false;
    const info = groupInfo(c);
    groups.set(chat, info);
    const name = info.username?.toLowerCase().replace(/^@/, "") ?? "";
    if (name !== "" && !official.groups.some((g) => g.toLowerCase() === name)) official.groups.push(name);
    if (name !== "" && !allow.telegram.includes(name)) allow.telegram.push(name);
    return true;
  };
}

/** The official channel from TELEGRAM_CHANNEL_ID: an @name as given, a -100… ID with its username from getChat. */
export async function readChannel(out: CommunityOut, channel: string | null): Promise<{ username: string | null; id: number | null }> {
  if (!channel) return { username: null, id: null };
  if (channel.startsWith("@")) return { username: channel.slice(1).toLowerCase(), id: null };
  const id = Number(channel);
  if (!Number.isSafeInteger(id)) return { username: null, id: null };
  const c = await out.chat(id).catch(() => null);
  return { username: c?.username ? c.username.toLowerCase() : null, id };
}

/** The site's host as the link rules compare hosts: lower case, Unicode form, no "www."; null for anything that isn't a URL. */
function hostOf(site: string): string | null {
  try {
    return domainToUnicode(new URL(site).hostname.toLowerCase()).replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Where members' links may point (decision 12): the site and a few trusted ones, the official Telegram names and the official X accounts. */
export function allowListOf(config: Pick<CommunityConfig, "allowedDomains" | "officialX">, official: OfficialAccounts): AllowList {
  const host = hostOf(official.site);
  const names = [...official.bot, ...(official.channel ? [official.channel] : []), ...official.groups].map((n) => n.toLowerCase().replace(/^@/, ""));
  return { domains: [...new Set([...DEFAULT_DOMAINS, ...(host ? [host] : []), ...config.allowedDomains])], telegram: [...new Set(names)], x: [...config.officialX] };
}

/** An amount for an alert's text: no "$", which the alerts' cleaning drops as a cashtag. */
const usd = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(2)} USD`;

type BudgetWord = keyof CommunityDictionary["admin"]["budget"];
/** An event's words for every call (`all`), and a kind of call's own where it has them (moderation checks are "triage", answers "answer"). */
type EventWords = { all: BudgetWord } & Partial<Record<CallKind, BudgetWord>>;

/** The words of each budget event without figures: a pause, a bad request and a return have each kind's own. */
const FIXED: Readonly<Record<Exclude<BudgetEvent, "warn80" | "lane" | "cap">, EventWords>> = {
  circuit: { all: "circuit", triage: "circuitChecks", answer: "circuitAnswers" },
  auth: { all: "auth" },
  bad_request: { all: "badRequest", triage: "badRequestChecks", answer: "badRequestAnswers" },
  billing: { all: "billing" },
  not_found: { all: "notFound" },
  restored: { all: "restored", triage: "backChecks", answer: "backAnswers" },
};
/** The kind's own words when it has them, else those for every call. */
const wordOf = (words: EventWords, kind: CallKind | null): BudgetWord => (kind === null ? undefined : words[kind]) ?? words.all;

/**
 * A budget event for the admin chat. A pause, a bad request or a return
 * about one kind of call (`kind`, claude/budget.ts) names it: moderation
 * checks or AI answers; without a kind it is about AI as a whole. Stops
 * that need an owner stay: a key Anthropic refused (replace or fix
 * ANTHROPIC_API_KEY), billing and a missing model (both until /ai on); the
 * rest are routine.
 */
export function budgetAlert(event: BudgetEvent, status: BudgetStatus, lane: Lane | null, kind: CallKind | null, w: CommunityDictionary): AdminAlert {
  const b = w.admin.budget;
  const done =
    event === "warn80" ? fillText(b.warn, { spent: usd(status.spentUsd), cap: usd(status.capUsd) })
    : event === "lane" ? fillText(b.lane, { lane: lane ? w.admin.lanes[lane] : "" })
    : event === "cap" ? fillText(b.cap, { cap: usd(status.capUsd) })
    : b[wordOf(FIXED[event], kind)];
  const routine = event !== "billing" && event !== "not_found" && event !== "auth";
  return { chat: null, kind: "budget", category: null, member: null, excerpt: null, link: null, done, aiGuess: null, undo: null, messageId: null, routine, urgent: false };
}

/** The site's knowledge is newer than the worker's: someone must redeploy, so it stays. */
export const knowledgeAlert = (w: CommunityDictionary): AdminAlert => ({
  chat: null, kind: "knowledge", category: null, member: null, excerpt: null, link: null, done: w.admin.knowledge.stale, aiGuess: null, undo: null, messageId: null, routine: false, urgent: false,
});

/** The Ask prompt with its reply field (ForceReply), sent like an answer: queued behind the chat's answers, within the same limits. */
export async function sendPrompt(out: CommunityOut, chat: ChatId, view: View): Promise<void> {
  await out.send(chat, view.text, { kind: "answer", ...(view.keyboard ? { keyboard: view.keyboard } : {}), ...(view.forceReply ? { forceReply: view.forceReply } : {}) });
}
