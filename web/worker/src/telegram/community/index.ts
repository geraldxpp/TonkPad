import type { Fetch } from "../../alerts/deliver";
import type { TokenStore } from "../../store";
import { createAgentData } from "../agent/data";
import { createFigures } from "../agent/figures";
import { createPackSource } from "../agent/pack-source";
import { createBudget } from "../claude/budget";
import { createClaudeClient } from "../claude/client";
import { createAiLimits } from "../claude/limits";
import type { ClaudeClient } from "../claude/types";
import { communityWords } from "../i18n/community";
import type { Sender } from "../sender";
import { createAdmins } from "./admins";
import { createAlerts } from "./alerts";
import { loadCommunityConfig } from "./config";
import { botRightsOf, readAdminLists } from "./index-admins";
import { buildCommunity } from "./index-build";
import { startDeleter } from "./index-deleter";
import { type AlertGate, createAlertGate } from "./index-gate";
import { startHooks } from "./index-hooks";
import { retireState, statePathOf } from "./index-off";
import { allowListOf, budgetAlert, type GroupInfo, groupRereader, knowledgeAlert, openStore, readChannel, readGroups, sendPrompt } from "./index-setup";
import { checkSetup, createAdminChatWatch, retryingReader, type SetupResult } from "./setup";
import { createSetupRetry } from "./setup-retry";
import type { FailureWatch } from "./setup-status";
import { createTelegramOut } from "./telegram-out";
import type { ChatId, CommunityHooks, OfficialAccounts } from "./types";

export interface CommunityDeps {
  env: Readonly<Record<string, string | undefined>>;
  snapshotPath: string;
  sender: Sender;
  /** The site's origin, as the bot links it. */
  site: string;
  store: TokenStore;
  /** The worker's ETH price in dollars, or null without one. */
  ethUsd: () => number | null;
  /** The bot, once getMe has answered: its ID and every username it answers to. */
  me: () => { id: number; usernames: string[] } | null;
  /** TELEGRAM_CHANNEL_ID: the official channel (@name or -100… ID), or null. */
  channel: string | null;
  /** Creator wallets that may use the brand in a token's name (TELEGRAM_BRAND_CREATORS), lower-cased. */
  brandCreators: ReadonlySet<string>;
  /** Gets no message text and no user ID: group IDs and counts at most. */
  log: (line: string) => void;
  now: () => number;
  fetchFn?: Fetch;
  /** Tests pass a fake: nothing then reaches Anthropic. */
  client?: ClaudeClient;
  /** Hears that what the menus offer changed after start (a group dropped, the admin chat passed, community mode off), so they are set again. */
  onChange?: () => void;
  /** The waits between tries of a failed setup read (tests pass an instant one). */
  sleep?: (ms: number) => Promise<void>;
  /** What Telegram answers when a setup read fails (setup-status.ts, under the Sender): without it every failed read is unsure. */
  failures?: FailureWatch;
}

/**
 * Starts the community agent and moderator (prompts/15-community-agent.md),
 * or returns null when it is off: no TELEGRAM_COMMUNITY_CHATS and no
 * ANTHROPIC_API_KEY (community.json then keeps no member's records), the
 * bot unknown, the admin chat failing its checks for certain, or a site
 * whose Security page names no contact. community.json is pruned and
 * written back before any of those checks, and the deletes it holds still
 * go when community mode is off (index-deleter.ts). A group that fails its
 * own checks for certain is dropped (its records forgotten when the bot
 * isn't in it any more); checks Telegram couldn't answer run as unsure and
 * are asked again from the tick, the admin chat's alerts waiting meanwhile.
 * AI runs only with a usable key and a budget above 0; else rules alone.
 */
export async function startCommunity(deps: CommunityDeps): Promise<CommunityHooks | null> {
  const { config, note } = loadCommunityConfig(deps.env, deps.snapshotPath);
  deps.log(note);
  if (!config) {
    await retireState(statePathOf(deps.env, deps.snapshotPath), deps.now(), deps.log);
    return null;
  }
  const { log, now } = deps;
  // Pruned and written back first, whatever the checks below decide.
  const store = await openStore(config, log, now);
  const { records } = store;
  const me = deps.me();
  if (config.adminChat !== null && me === null) {
    log("community off: the bot's own ID isn't known yet (start it once getMe has answered)");
    store.stop();
    return null;
  }
  let gate: AlertGate | null = null;
  const out = createTelegramOut({ sender: deps.sender, records, adminChat: config.adminChat, adminReady: () => gate === null || gate.state() === "open", log, now });
  const off = async (why: string) => {
    log(`community off: ${why}`);
    gate?.shut();
    out.stop();
    // What the last run scheduled (notices, routine alerts, removed messages) still goes when due.
    startDeleter({ out, records, left: () => store.deletesLeft(), now, log });
    await store.save();
    return null;
  };
  const adminWords = communityWords(config.adminLang);
  const adminChat = config.adminChat;
  let groups = new Map<ChatId, GroupInfo>();
  const title = (chat: ChatId) => groups.get(chat)?.title || String(chat);
  // Alerts wait at the gate until the admin chat passed its checks: it must be private before names and excerpts go there.
  gate = adminChat !== null ? createAlertGate(createAlerts({ out, records, adminChat, words: adminWords, now, groupTitle: title, lang: config.adminLang }), now, "wait") : null;
  const sink = gate;
  const pack = createPackSource({ site: deps.site, fetchFn: deps.fetchFn, log, now, onStale: () => sink?.alert(knowledgeAlert(adminWords)) });
  await pack.refresh(now());
  const read = await readGroups(out, config.chats, retryingReader(undefined, deps.sleep));
  groups = read.groups;

  let setup: SetupResult | null = null;
  let chats: ChatId[] = [];
  const setupDeps = sink && adminChat !== null && me
    ? { out, chats: config.chats, adminChat, owners: config.owners, botId: me.id, contact: pack.contact(), alerts: sink, words: adminWords, sleep: deps.sleep, failures: deps.failures }
    : null;
  if (setupDeps && sink) {
    setup = await checkSetup(setupDeps);
    for (const line of setup.notes) log(line);
    // The bot isn't in these groups any more, for certain: what it kept about their members goes (missing rights alone keep it).
    for (const chat of setup.gone) records.forgetChat(chat);
    if (!setup.adminChatOk) return off("the admin chat failed its checks");
    chats = setup.chats;
    if (setup.adminChat === "ok") sink.open();
  }
  if (pack.contact() === "none") return off("the site's Security page has no contact");

  let client: ClaudeClient | null = null;
  try {
    client = config.apiKey === null ? null : (deps.client ?? createClaudeClient({ apiKey: config.apiKey, log, fetch: deps.fetchFn }));
  } catch (error) {
    log(`AI off: the Claude client didn't start (${error instanceof Error ? error.name : "error"})`);
  }
  const budget = client
    ? createBudget({
        capUsd: config.budgetUsd, saved: records.spend(), off: records.aiOff(), save: records.setSpend, saveOff: records.setAiOff, now,
        onEvent: (event, status, lane, kind) => {
          log(`AI budget: ${event}${kind ? ` (${kind})` : ""}`);
          sink?.alert(budgetAlert(event, status, lane, kind, adminWords));
        },
      })
    : null;
  const limits = createAiLimits();
  const figures = createFigures({ site: deps.site, fetchFn: deps.fetchFn, ethUsd: deps.ethUsd, now });
  const data = createAgentData({ store: deps.store, figures, brandCreators: deps.brandCreators, now });
  const admins = createAdmins({ out, owners: config.owners, botId: () => deps.me()?.id ?? null, now });
  await readAdminLists(admins, chats, retryingReader(undefined, deps.sleep), now, log);
  const rights = botRightsOf(admins);
  await rights.read(chats);

  const channel = await readChannel(out, deps.channel);
  const official: OfficialAccounts = {
    bot: me?.usernames ?? [],
    channel: channel.username,
    groups: chats.flatMap((chat) => groups.get(chat)?.username ?? []),
    x: config.officialX,
    site: deps.site,
  };
  const allow = allowListOf(config, official);
  const adminReady = () => sink === null || sink.state() === "open";
  const community = buildCommunity({
    config, chats, out, records, client, budget, limits, admins, alerts: sink, adminReady, pack, data, official, allow, me: deps.me,
    teamChat: (chat, sender) => sender.id === groups.get(chat)?.linked || sender.id === channel.id || (channel.username !== null && sender.username?.toLowerCase() === channel.username),
    discussion: (chat) => (groups.get(chat)?.linked ?? null) !== null,
    title, rights: (chat) => rights.get(chat), prompt: (chat, view) => sendPrompt(out, chat, view), site: deps.site, now, log,
  });
  const watch = adminChat !== null && sink
    ? createAdminChatWatch({ out, adminChat, alerts: sink, words: adminWords, autoDelete: setup?.autoDelete ?? null, ready: () => sink.state() === "open" })
    : null;
  let disable: ((why: string) => Promise<void>) | null = null;
  // Groups that run though getChat failed at start: their title, username and linked channel are read again.
  const unread = read.unread.filter((chat) => chats.includes(chat));
  const retry = setupDeps && sink && setup && (setup.adminChat === "unsure" || setup.unsure.length > 0 || unread.length > 0)
    ? createSetupRetry({
        setup: setupDeps, adminChat: setup.adminChat === "unsure", chats: setup.unsure, unread, readInfo: groupRereader(out, groups, official, allow), log, now: now(),
        passed: (autoDelete) => {
          sink.open();
          watch?.sawAutoDelete(autoDelete);
          deps.onChange?.();
        },
        failed: () => {
          sink.shut();
          void disable?.("the admin chat failed its checks");
        },
        drop: (chat, gone) => {
          community.drop(chat);
          // Its checks ended first (they read the records); then, when the bot isn't in it any more, every record there goes.
          if (gone) records.forgetChat(chat);
          deps.onChange?.();
        },
      })
    : null;
  const later = retry ? "; checks Telegram couldn't answer are tried again shortly" : "";
  log(`community started: ${chats.length} group${chats.length === 1 ? "" : "s"}, AI ${client ? `on, answers on ${config.answerModel}` : "off"}${later}`);
  const hooks = startHooks({
    community, out, records, store, admins, limits, client, budget, pack, alerts: sink, watch, setup: retry, adminChat,
    adminReady, privateAi: config.privateAi, readRights: () => rights.read(community.chats), onChange: deps.onChange, now, log,
  });
  disable = hooks.disable;
  return hooks;
}
