import { type Locale, LOCALES } from "@/shared/i18n/config";
import { AnsweredMap } from "../agent/answered";
import { JobQueue } from "../agent/jobs";
import { createProactive, type Proactive } from "../agent/proactive";
import { answerLabels, crisisView } from "../agent/render";
import { type Me, topicOf } from "../agent/triggers";
import type { AgentData, PackSource } from "../agent/types";
import { ANSWERS_AT_ONCE } from "../claude/limits";
import type { AiLimits, Budget, ClaudeClient } from "../claude/types";
import { botLocale } from "../i18n";
import { communityWords } from "../i18n/community";
import type { ModDeps } from "../mod/actions";
import { EditMemory } from "../mod/edits";
import { FloodWatch } from "../mod/flood";
import { createNewcomers } from "../mod/newcomers";
import { createRaidWatch, type RaidWatch } from "../mod/raid";
import type { TgChat, TgMessage, View } from "../types";
import { createAppeals } from "./appeal";
import type { CommunityConfig } from "./config";
import { createControls } from "./controls";
import { fullName } from "./controls-people";
import { createHolds, createOnce, type Holds, type Once } from "./hold";
import { endGroup, guardedRecords } from "./index-guard";
import { createMembers, type Members } from "./members";
import type { CommunityOut } from "./out";
import { createPipeline } from "./pipeline";
import { createCommands } from "./pipeline-commands";
import { createModeration } from "./pipeline-mod";
import { createTriage } from "./pipeline-triage";
import { createWho } from "./pipeline-who";
import { createQa, type Qa } from "./qa";
import { createReports } from "./report";
import { statusView } from "./status";
import type { Admins, AlertSink, AllowList, ChatId, Newcomers, OfficialAccounts, Records, UserId } from "./types";
import { createUndo } from "./undo";
import type { CommunityDictionary } from "./words";

/**
 * The community agent's parts, wired together (community/index.ts does the
 * reading and writing around it; the tests build it with fakes). Nothing
 * here touches the network or starts a timer.
 */

export interface BuildInput {
  config: CommunityConfig;
  /** The community groups that passed the setup checks. */
  chats: readonly ChatId[];
  out: CommunityOut;
  records: Records;
  client: ClaudeClient | null;
  budget: Budget | null;
  limits: AiLimits;
  /** With known (admins.ts), a group whose admin list Telegram never confirmed is moderated as in observe mode until it is (index-guard.ts). */
  admins: Admins & { known?(chat: ChatId): boolean };
  /** The admin chat's alerts, or null without an admin chat. */
  alerts: (AlertSink & { tick(now: number): Promise<void> }) | null;
  /** Whether the admin chat passed its setup checks (always, unless given): until then a /report gets "Reports aren't set up yet". */
  adminReady?: () => boolean;
  pack: PackSource;
  data: AgentData;
  official: OfficialAccounts;
  allow: AllowList;
  me: () => Me | null;
  /** A chat whose posts are the team's: the official channel, or a group's own linked channel. */
  teamChat: (chat: ChatId, sender: TgChat) => boolean;
  /** A group with a linked channel, where people who never joined may comment. */
  discussion: (chat: ChatId) => boolean;
  /** A community group's title, as getChat gave it at start. */
  title: (chat: ChatId) => string;
  /** The bot's rights in a group, as last read, for /status. */
  rights: (chat: ChatId) => { delete: boolean; restrict: boolean } | null;
  prompt: (chat: ChatId, view: View) => Promise<void>;
  site: string;
  now: () => number;
  log: (line: string) => void;
  /** The bot's words: i18n/community unless given (tests pass placeholders). */
  words?: (lang: Locale) => CommunityDictionary;
}

export interface Community {
  owns(chat: ChatId): boolean;
  /** The community groups being run: the same list the controls, undo and reviews read, so a group dropped later leaves them all. */
  chats: readonly ChatId[];
  /** Stops running a group whose setup check failed for certain after start: its pending new-member checks end without punishment, and its raid watch goes. */
  drop(chat: ChatId): void;
  pipeline: ReturnType<typeof createPipeline>;
  qa: Qa;
  newcomers: Newcomers;
  raid: RaidWatch;
  members: Members;
  reports: ReturnType<typeof createReports>;
  /** The admin chat's buttons, controls and reviews: null without an admin chat. */
  undo: ReturnType<typeof createUndo> | null;
  controls: ReturnType<typeof createControls> | null;
  appeals: ReturnType<typeof createAppeals> | null;
  flood: FloodWatch;
  edits: EditMemory;
  proactive: Proactive;
  answered: AnsweredMap;
  asks: Holds;
  shares: Holds;
  answers: JobQueue;
  checks: JobQueue;
  /** The DM warning's 30 minutes per chat. */
  dm: Once;
}

/** Every language's answer label and footer: a reply to one of the bot's answers is known by its frame. */
function frameLabels(words: (lang: Locale) => CommunityDictionary): ReadonlySet<string> {
  const all = LOCALES.map((l) => words(l.code));
  return new Set([...answerLabels(all), ...all.map((d) => d.answer.footer.trim()).filter(Boolean)]);
}
const DM_WARNING_MS = 30 * 60_000;
/** Without an admin chat nothing reaches a team: alerts go nowhere. */
const NO_ALERTS: AlertSink = { alert: () => undefined };

/**
 * The helpline reply to someone at risk past the group's public pace (one
 * a group every 5 minutes, pipeline-crisis.ts): to them alone, as an
 * ephemeral message, and nothing public; best effort. Only a person gets
 * one, never someone posting as a chat, nor a bot.
 */
function crisisCopy(out: CommunityOut, words: (lang: Locale) => CommunityDictionary, helplineUrl: string, m: TgMessage): void {
  const from = m.sender_chat ? undefined : m.from;
  if (!from || from.is_bot === true || !Number.isSafeInteger(from.id) || from.id <= 0) return;
  const view = crisisView(words(botLocale(from.language_code)), helplineUrl);
  void out.send(m.chat.id, view.text, { kind: "notice", ephemeralTo: from.id, ephemeralOnly: true, keyboard: view.keyboard, thread: topicOf(m) }).catch(() => undefined);
}

export function buildCommunity(input: BuildInput): Community {
  const { config, out, records, client, budget, limits, admins, pack, me, site, now, log } = input;
  const chats = [...input.chats];
  const owned = new Set(chats);
  const owns = (chat: ChatId) => owned.has(chat);
  const adminChat = input.alerts ? config.adminChat : null;
  const words = input.words ?? communityWords;
  const adminWords = words(config.adminLang);
  const sink = input.alerts ?? NO_ALERTS;
  const bot = () => me()?.usernames[0] ?? null;
  const flood = new FloodWatch();
  const edits = new EditMemory();
  // What acts on people reads a group whose admin list Telegram never confirmed as observe mode: only protective deletes (index-guard.ts).
  const acting = guardedRecords(records, (chat) => admins.known?.(chat) === false);
  const mod: ModDeps = { out, records: acting, words, alerts: sink, recentIds: (chat, user, at) => flood.recent(chat, user, at), bot, now, adminLang: config.adminLang, site, log };
  const raid = createRaidWatch({ ...mod, groupLang: config.groupLang, settings: acting.settings, update: records.updateSettings, chats });
  const newcomers = createNewcomers({
    ...mod, admins, allowedBots: config.allowedBots, raid, settings: acting.settings, groupLang: config.groupLang, owns, press: (user: UserId, at: number) => limits.press(user, at),
  });
  const members = createMembers({ owns, records, newcomers, out, admins, alerts: sink, botId: () => me()?.id ?? null, owners: config.owners, words: adminWords, log, now });
  const proactive = createProactive();
  const answered = new AnsweredMap();
  const asks = createHolds();
  const shares = createHolds();
  const answers = new JobQueue({ concurrency: 4, perKey: ANSWERS_AT_ONCE[config.answerModel], maxPending: 50, now, onError: () => log("an answer job failed") });
  const checks = new JobQueue({ concurrency: 4, maxPending: 200, now, onError: () => log("a check job failed") });
  const dm = createOnce(DM_WARNING_MS);
  // One pace per group for the DM-safety warning, whoever posts it: the rules (a help request), an answer, or Haiku's check.
  const dmWarning = (chat: ChatId, at: number) => dm.first(String(chat), at);
  const qa = createQa({
    out, records, client, budget, limits, pack, data: input.data, official: input.official, answered, answers, proactive, asks, shares,
    alerts: input.alerts, adminReady: input.adminReady, words, groupLang: config.groupLang, site, bot, helplineUrl: config.helplineUrl, userCodeKey: config.userCodeKey,
    privateAi: config.privateAi, home: chats[0] ?? null, dmWarning, prompt: input.prompt, answerModel: config.answerModel, now, log,
  });
  const reports = createReports({ out, admins, limits, alerts: input.alerts, words, now, records, ready: input.adminReady });
  // Trust fingerprints the name exactly as the rules and /trust build it.
  const nameOf = async (chat: ChatId, user: number) => {
    const member = await out.member(chat, user);
    return member ? fullName(member.user) : null;
  };
  const undo = input.alerts && adminChat !== null ? createUndo({ out, records, admins, limits, raid, adminChat, chats, words: adminWords, nameOf, now }) : null;
  const status = (chat: ChatId) =>
    statusView({
      title: input.title(chat), counts: records.counts(chat, now()), budget: budget?.status(now()) ?? null, settings: records.settings(chat), knowledge: pack.health(),
      rights: input.rights(chat), queues: { answers: answers.stats().waiting, checks: checks.stats().waiting }, answerModel: config.answerModel, now: now(),
    }, adminWords);
  const controls = input.alerts && adminChat !== null
    ? createControls({ out, records, admins, budget, raid, alerts: input.alerts, adminChat, chats, words, adminWords, status, limits, now })
    : null;
  const appeals = input.alerts ? createAppeals({ out, records, alerts: input.alerts, chats, groupTitle: input.title, words, limits, now }) : null;
  // A bot in TELEGRAM_ALLOWED_BOTS counts as an admin, so it is never moderated.
  const who = createWho({
    out, records: acting, admins, teamChat: input.teamChat, discussion: input.discussion, groupLang: config.groupLang, strictness: (chat) => acting.settings(chat).strictness,
    allowedBots: config.allowedBots,
  });
  const moderation = createModeration({ records: acting, admins, raid, flood, edits, standing: who.standing, mod, allow: input.allow, pack, me, groupLang: config.groupLang, dmWarning });
  const commands = createCommands({ out, me, reports, controls, words, groupLang: config.groupLang, site, now });
  const triage = createTriage({
    client, budget, limits, checks, official: input.official, allow: input.allow, userCodeKey: config.userCodeKey, records: acting, out, alerts: sink, mod, raid,
    crisis: (m) => qa.crisis(m), crisisCopy: (m) => crisisCopy(out, words, config.helplineUrl, m), proactive, me, words, site, dmWarning, now, log,
  });
  const pipeline = createPipeline({ out, alerts: sink, adminChat, owns, me, who, moderation, commands, triage, qa, members, proactive, answered, edits, labels: frameLabels(words), adminWords, now, log });
  const drop = (chat: ChatId) => {
    owned.delete(chat);
    const i = chats.indexOf(chat);
    if (i >= 0) chats.splice(i, 1);
    // Nobody can pass a check the router no longer hands the agent: they end unpunished, and the raid watch goes quietly.
    endGroup([newcomers, raid], chat, log);
  };
  return { owns, chats, drop, pipeline, qa, newcomers, raid, members, reports, undo, controls, appeals, flood, edits, proactive, answered, asks, shares, answers, checks, dm };
}
