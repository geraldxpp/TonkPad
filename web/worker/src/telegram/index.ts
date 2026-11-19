import { type Fetch, redactor } from "../alerts/deliver";
import type { TokenStore } from "../store";
import type { TonkEvent } from "../tonk/events";
import type { TonkToken } from "../tonk/launch";
import { buysLast15m, toToken } from "../tokens";
import { HOT_BUYS, listView } from "../views/list";
import { findTrackedToken } from "../views/token";
import { botApi, TelegramError } from "./api";
import { ChannelPoster } from "./channel";
import { loadTelegramConfig } from "./config";
import { Poller } from "./poller";
import { syncProfile } from "./profile";
import { Limiter } from "./limiter";
import { type BotContext, type BotData, handleUpdate, type Out } from "./router";
import { GROUP_GAP, PRIVATE_GAP, Sender } from "./sender";
import { loadBotState, saveBotState } from "./state";
import type { TgChat, TgUser } from "./types";

/** What the worker holds: the feed's events in, a poll's end, /health, and a save on shutdown. */
export interface TelegramBot {
  onFeedEvents(events: readonly TonkEvent[], timeOf: (block: number) => number): void;
  afterTonkPoll(lagBlocks: number): Promise<void>;
  health(): Record<string, unknown>;
  save(): Promise<void>;
  stop(): void;
}

export interface TelegramDeps {
  store: TokenStore;
  env: Readonly<Record<string, string | undefined>>;
  snapshotPath: string;
  /** Whether the worker follows tonkfun.fun's launchpad (the channel needs it). */
  tonkFeed: boolean;
  log: (line: string) => void;
  fetchFn?: Fetch;
  now?: () => number;
}

const EDIT_GAP = 250;
const isPrivate = (chat?: TgChat) => chat?.type === "private";
/**
 * A reply to a person: at most 10 waiting in a private chat, 3 in a group
 * (a group drains 20 a minute, so a busy one drops extras instead of holding
 * the bot up), sent within 20 s or dropped, each request 10 s at most. With
 * the 5 s sweep below, no chat or user ID stays in memory past a minute.
 */
const replyLimits = (chat?: TgChat) => ({ maxQueued: isPrivate(chat) ? 10 : 3, maxWaitMs: 20_000, timeoutMs: 10_000 });

/** The worker's tokens as the bot reads them: never marking one opened, so no Helius credits are spent. */
function storeData(store: TokenStore, now: () => number): BotData {
  return {
    ready: () => store.size > 0,
    token: (address) => {
      const t = findTrackedToken(store.all(), address);
      return t ? toToken(t, now(), buysLast15m(t, now()) >= HOT_BUYS) : null;
    },
    latest: (limit) =>
      store.all().filter((t) => t.launchpad === "tonk").sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map((t) => toToken(t, now())),
    trending: (limit) => listView(store.all(), { chain: "all", pad: "all", tab: "trending", tf: "24h", q: "", limit }, now()).rows,
  };
}

/**
 * Starts tonkfun.fun's Telegram bot inside the worker when TELEGRAM_BOT_TOKEN
 * is set (telegram/config.ts), or returns null. It reads the worker's data and
 * answers; it holds no wallet key and never sends a transaction.
 */
export async function startTelegram(deps: TelegramDeps): Promise<TelegramBot | null> {
  const { config, note } = loadTelegramConfig(deps.env, deps.snapshotPath);
  deps.log(note);
  if (!config) return null;
  const redact = redactor([config.token]);
  const log = (line: string) => deps.log(redact(line));
  const now = deps.now ?? Date.now;
  const api = botApi(config.token, deps.fetchFn ?? fetch);
  const sender = new Sender(api, log, now);
  const state = await loadBotState(config.statePath);
  let saving: ReturnType<typeof setTimeout> | null = null;
  const save = () => saveBotState(config.statePath, state).catch((error: unknown) => log(`state not saved: ${error instanceof Error ? error.name : "error"}`));
  const persist = () => {
    if (saving) return;
    saving = setTimeout(() => {
      saving = null;
      void save();
    }, 2_000);
  };

  let username: string | null = null;
  let inlineOn = false;
  /** Privacy mode (on by default): in groups Telegram shows the bot only its commands and replies to it. */
  let privacyMode = true;
  let refused = false;
  const out: Out = {
    async send(chat, view, replyTo) {
      await sender.toChat(String(chat.id), isPrivate(chat) ? PRIVATE_GAP : GROUP_GAP, "sendMessage", {
        chat_id: chat.id,
        text: view.text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: view.forceReply ?? view.keyboard,
        ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
      }, replyLimits(chat));
    },
    async edit(target, view, chat) {
      const where = "inlineId" in target ? { inline_message_id: target.inlineId } : { chat_id: target.chatId, message_id: target.messageId };
      const key = "inlineId" in target ? `inline:${target.inlineId}` : String(target.chatId);
      const gap = chat && !isPrivate(chat) ? GROUP_GAP : EDIT_GAP;
      await sender.toChat(key, gap, "editMessageText", { ...where, text: view.text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: view.keyboard }, replyLimits(chat));
    },
    async answer(id, text) {
      return (await sender.direct("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) })) !== null;
    },
    async inline(id, results, button) {
      // Personal: each card is in the asker's own language, so Telegram mustn't hand one person's answer to another.
      await sender.direct("answerInlineQuery", { inline_query_id: id, results, cache_time: 10, is_personal: true, button: { text: button, start_parameter: "help" } });
    },
  };
  const ctx: BotContext = {
    data: storeData(deps.store, now), out, site: config.site, bot: () => username, inline: () => inlineOn, now,
    // Inline: 5 per person in 10 s (pasting an address takes 2 or 3), so a few accounts can't use up the shared 10 a second.
    limiter: new Limiter(8, 10_000), inlineLimiter: new Limiter(5, 10_000), inlineAll: new Limiter(10, 1_000), pressAll: new Limiter(5, 1_000),
  };
  const poller = new Poller(api, (update) => handleUpdate(update, ctx), log);
  // Every 5 s, forget the chat and user IDs the rate limits held: none is kept past a minute (the privacy page says so).
  const sweep = setInterval(() => {
    const at = Date.now();
    for (const limiter of [ctx.limiter, ctx.inlineLimiter]) limiter.prune(at);
    sender.forget(at);
  }, 5_000);
  sweep.unref?.();

  const channel = config.channelId && deps.tonkFeed
    ? new ChannelPoster({
        sender, chatId: config.channelId, lang: config.channelLang, site: config.site,
        launch: (address) => {
          const t = deps.store.get(address);
          return t?.tonk ? (t as TonkToken) : null;
        },
        launches: () => deps.store.all().filter((t): t is TonkToken => Boolean(t.tonk)),
        card: (t) => toToken(t, now()),
        brandCreators: config.brandCreators, skip: config.channelSkip,
        state: state.channel, persist, now, log,
      })
    : null;
  if (config.channelId && !deps.tonkFeed) log("channel off: the worker doesn't follow tonkfun.fun's launchpad here");

  // Who the bot is, then polling, with its profile set beside it; a network failure retries, a refused token stops.
  void (async () => {
    let botId = 0;
    for (let wait = 5_000; !refused; wait = Math.min(300_000, wait * 2)) {
      try {
        const me = await api.call<TgUser>("getMe", {});
        username = me.username ?? null;
        inlineOn = me.supports_inline_queries === true;
        privacyMode = me.can_read_all_group_messages !== true;
        if (!privacyMode) log("privacy mode is off: in groups Telegram shows the bot every message (turn it back on with /setprivacy in @BotFather)");
        botId = me.id;
        log(`signed in as @${username ?? "?"}${inlineOn ? "" : " (inline mode is off: /setinline in @BotFather)"}`);
        break;
      } catch (error) {
        if (error instanceof TelegramError && (error.status === 401 || error.status === 404)) {
          refused = true;
          poller.health.state = "unauthorized";
          log("Telegram refused the bot token (check TELEGRAM_BOT_TOKEN)");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    void syncProfile(sender, state.profileHash, log, botId).then((hash) => {
      if (!hash) return;
      state.profileHash = hash;
      persist();
    });
    await poller.run();
  })();

  return {
    onFeedEvents: (events, timeOf) => channel?.onEvents(events, timeOf),
    afterTonkPoll: async (lag) => {
      await channel?.afterPoll(lag);
    },
    health: () => ({
      enabled: true,
      polling: poller.health.state,
      bot: username,
      updates: poller.health.updates,
      lastUpdateAt: poller.health.lastUpdateAt ? new Date(poller.health.lastUpdateAt).toISOString() : null,
      calls: sender.stats.calls,
      failed: sender.stats.failed,
      dropped: { replies: sender.stats.dropped, updates: poller.health.dropped },
      inline: inlineOn,
      privacyMode,
      channel: channel
        ? { enabled: true, posted: channel.stats.posted, skipped: channel.stats.skipped, lastPostAt: channel.stats.lastPostAt ? new Date(channel.stats.lastPostAt).toISOString() : null }
        : { enabled: false },
    }),
    save,
    stop: () => {
      clearInterval(sweep);
      poller.stop();
    },
  };
}
