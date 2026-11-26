import { type Locale, localizePath } from "@/shared/i18n/config";
import { clip, visibleText } from "../../text";
import type { AnsweredMap } from "../agent/answered";
import type { JobQueue } from "../agent/jobs";
import type { Proactive } from "../agent/proactive";
import { dmWarningView, type FallbackKind, fallbackView, LINK_PATHS } from "../agent/render";
import type { AgentData, PackSource } from "../agent/types";
import type { AiLimits, AnswerModel, Budget, ClaudeClient, Lane } from "../claude/types";
import { allAddresses, plainText } from "../mod/rules";
import { maskForModel } from "../mod/secrets";
import { CRISIS_STRONG, DM_WORDS, DRAINER_WORDS, KEY_WORDS, matchesAny, SECURITY_WORDS } from "../mod/words";
import { escapeHtml as esc } from "../text";
import type { TgChat, TgUser, View } from "../types";
import { messageLink } from "./alerts";
import { fullName } from "./controls-people";
import type { Holds, Once } from "./hold";
import type { CommunityOut, SendKind } from "./out";
import type { Gap } from "./qa-gap";
import type { AdminAlert, AlertSink, ChatId, Escalation, OfficialAccounts, Records } from "./types";
import type { CommunityDictionary } from "./words";

/** What the Q&A flow needs (community/qa.ts). */
export interface QaDeps {
  out: CommunityOut;
  records: Records;
  /** Null when no model call can run at all (no key, or a daily budget of 0). */
  client: ClaudeClient | null;
  budget: Budget | null;
  /** The model answers run on (TELEGRAM_AI_ANSWER_MODEL): its settings, its deadline in the answers' queue and its "typing…". */
  answerModel: AnswerModel;
  limits: AiLimits;
  pack: PackSource;
  data: AgentData;
  official: OfficialAccounts;
  answered: AnsweredMap;
  /** The answers' queue: 4 at once, 2 per chat on Sonnet 5.5 and Opus 5.5 and 1 on Haiku 5.5 (claude/limits.ts ANSWERS_AT_ONCE), 50 waiting, each for its model's answer deadline at most. */
  answers: JobQueue;
  proactive: Proactive;
  /** A private chat's text waiting for Ask, and an escalated question waiting for Share. */
  asks: Holds;
  shares: Holds;
  /** The admin chat's alerts, or null without one (then nothing offers Share). */
  alerts: AlertSink | null;
  /** Whether the admin chat passed its setup checks (always, unless given): until then Share says reports aren't set up yet, and shares nothing. */
  adminReady?: () => boolean;
  words: (lang: Locale) => CommunityDictionary;
  /** For a reply to someone posting as a chat, who has no app language. */
  groupLang: Locale;
  site: string;
  /** The bot's username, for the referral button. */
  bot: () => string | null;
  helplineUrl: string;
  /** Keys the pseudonymous metadata.user_id; null when the code is off. */
  userCodeKey: string | null;
  /** AI answers in private chats (TELEGRAM_AI_PRIVATE). */
  privateAi: boolean;
  /** The group whose day counters hold private chats' numbers (no IDs): the first community group, or null. */
  home: ChatId | null;
  /** The DM warning: true at most once per 30 minutes per chat, shared with Haiku's check. */
  dmWarning: (chat: ChatId, now: number) => boolean;
  /** Sends the Ask prompt with its reply field (a ForceReply, which CommunityOut doesn't send). */
  prompt: (chat: ChatId, view: View) => Promise<void>;
  now: () => number;
  log: (line: string) => void;
}

/** One question for the bot. */
export interface Ask {
  chat: TgChat;
  /** Who asked: their limits, cooldown and pseudonymous code. */
  user: TgUser;
  /** Whose question it is (for /ask in reply to another member, that member): who the team's alerts name. */
  author: TgUser;
  /** The question's message: the answer replies to it, and an edit of it takes the answer down. */
  messageId: number;
  thread?: number;
  /** Visible text, unmasked (it is masked before it is sent). */
  question: string;
  earlierAnswer: string | null;
  cardAddress: string | null;
  /** The asker's app language: the fixed replies use it; the model answers in the question's own. */
  lang: Locale;
  where: "group" | "private";
  mode: "direct" | "proactive";
  /** The message held media but no words. */
  media: boolean;
  /** What Telegram marked as a phone number or an e-mail address where the question came from: hidden before it goes to the model. */
  contacts?: readonly string[];
  /** What Haiku's check found about a question in a group; absent when no check ran. */
  checked?: Checked | null;
  /** The rules removed the question's message (a scam report carrying the scam's link, rules#1): replies go to its chat and topic, replying to nothing. */
  gone?: boolean;
}

/** What Haiku's check found about a question to the bot (community/pipeline-triage-verdict.ts). */
export interface Checked {
  /** Haiku read a DM scam in it: the reply carries the fixed DM warning, as for warns() (answers#7). */
  dmScam: boolean;
  /** The case that needs a person, or "none". */
  needs: Escalation | "none";
  /** Sends the check's alert for that case, at most once: when the answer path ends without escalating itself. Null for none. */
  alert: (() => void) | null;
}

/** The flow's own dedupes beside its dependencies. */
export interface QaCtx extends QaDeps {
  /** Paused, busy, cooldown and text-only notes: once per chat and kind per 10 minutes. */
  notes: Once;
  /** The crisis reply: once per member per 10 minutes. */
  crises: Once;
  /** The DM warning sent alone, when an asker's note was already sent: once per member and chat per 10 minutes. */
  warnings: Once;
  /** The same, in a group: at most once every 2 minutes per group, so a raid of askers can't fill its notices (answers#12). */
  alone: Gap;
  /** An asker's refusals within 10 minutes, for the alert at the second (max_tokens stops and timeouts don't count). */
  refusals: Once;
}

/** The longest question the model gets; longer ones get "Please ask in a sentence or two." */
export const MAX_QUESTION = 600;
const EXCERPT = 300;

export const laneOf = (a: Ask): Lane => (a.mode === "proactive" ? "proactive" : a.where === "private" ? "private" : "group");
/** Where an asker's numbers count: the group, or for a private chat the home group (never the chat itself, whose ID is the person's). */
export const counterChat = (a: Ask, ctx: QaCtx): ChatId | null => (a.where === "group" ? a.chat.id : ctx.home);

export function reply(a: Ask, view: View, ctx: QaCtx, kind: SendKind = "answer"): Promise<number | null> {
  return ctx.out.send(a.chat.id, view.text, { kind, replyTo: a.gone === true ? undefined : a.messageId, thread: a.thread, keyboard: view.keyboard });
}

/** A fixed reply in place of an answer, with the DM warning (written by code) when the question calls for it. */
export const fallback = (a: Ask, kind: FallbackKind, ctx: QaCtx): View =>
  fallbackView(kind, ctx.words(a.lang), ctx.site, { shared: a.where === "group", lang: a.lang, dmWarning: warnsFor(a) });

/** Notes that the asker got the DM warning, so it isn't sent alone again within 10 minutes. */
const warned = (a: Ask, ctx: QaCtx) => void ctx.warnings.first(`${a.chat.id}:${a.user.id}`, ctx.now());

/** The fixed reply in place of an answer ("not sure", a refusal, "please ask in a sentence or two"), with the DM warning when called for. */
export async function standIn(a: Ask, kind: FallbackKind, ctx: QaCtx): Promise<void> {
  if (warnsFor(a)) warned(a, ctx);
  await reply(a, fallback(a, kind, ctx), ctx);
}

/** The DM warning alone, for an asker at risk whose note went out already: once per member and chat per 10 minutes, and once every 2 minutes per group. */
export async function warnAlone(a: Ask, ctx: QaCtx): Promise<void> {
  const now = ctx.now();
  const group = a.where === "group" ? String(a.chat.id) : null;
  if (!warnsFor(a) || (group !== null && !ctx.alone.open(group, now)) || !ctx.warnings.first(`${a.chat.id}:${a.user.id}`, now)) return;
  if (group !== null) ctx.alone.use(group, now);
  await reply(a, dmWarningView(ctx.words(a.lang)), ctx, "notice");
}

/**
 * A fixed note in place of an answer (paused, busy, cooldown, text only):
 * once per chat and kind per 10 minutes, with the DM warning when called
 * for; when the note went out already, an asker at risk still gets the
 * warning alone.
 */
export async function note(a: Ask, kind: FallbackKind, ctx: QaCtx): Promise<void> {
  if (!ctx.notes.first(`${a.chat.id}:${kind}`, ctx.now())) return warnAlone(a, ctx);
  await standIn(a, kind, ctx);
}

/** "Please send the details only to the contact on the Security page", with the Security button. */
export function flawView(a: Ask, ctx: QaCtx): View {
  const w = ctx.words(a.lang);
  const url = `${ctx.site}${localizePath(a.where === "group" ? "en" : a.lang, LINK_PATHS.security)}`;
  return { text: esc(w.answer.flaw), keyboard: { inline_keyboard: [[{ text: w.links.security, url }]] } };
}

/** A flaw report, as the rules read one: security words, with 200 characters or more or an address. */
export const isFlaw = (q: string): boolean => matchesAny(SECURITY_WORDS, plainText(q)) && ([...q].length >= 200 || allAddresses(q).length > 0);
export const isCrisis = (q: string): boolean => matchesAny(CRISIS_STRONG, plainText(q));
/** DMs, keys or recovery phrases, or wallet "validation": the answer carries the fixed DM-scam warning. */
export function warns(q: string): boolean {
  const plain = plainText(q);
  return matchesAny(DM_WORDS, plain) || matchesAny(KEY_WORDS, plain) || matchesAny(DRAINER_WORDS, plain);
}
/** The same for an asked question, or Haiku's check read a DM scam in it. */
export const warnsFor = (a: Ask): boolean => a.checked?.dmScam === true || warns(a.question);

export const personOf = (user: TgUser): NonNullable<AdminAlert["member"]> => ({ id: user.id, name: fullName(user), username: user.username ?? null, since: null });
/** A short excerpt for the admins: cleaned and masked, or null. */
export function excerptOf(text: string): string | null {
  const excerpt = clip(maskForModel(visibleText(text)), EXCERPT).trim();
  return excerpt === "" ? null : excerpt;
}
export const linkOf = (a: Ask): string | null => (a.where === "group" ? messageLink(a.chat, a.messageId, a.thread) : null);
