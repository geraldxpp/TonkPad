import { type Fetch, redactor } from "../alerts/deliver";
import type { TokenStore } from "../store";
import type { TonkEvent } from "../tonk/events";
import type { TonkToken } from "../tonk/launch";
import { toToken } from "../tokens";
import { botApi, TelegramError } from "./api";
import { ChannelPoster } from "./channel";
import type { ClaudeClient } from "./claude/types";
import { createOnce } from "./community/hold";
import { watchFailures } from "./community/setup-status";
import { loadTelegramConfig } from "./config";
import { botHealth } from "./index-health";
import { senderOut, storeData } from "./index-out";
import { createProfileSync } from "./index-profile";
import { Limiter } from "./limiter";
import { Poller } from "./poller";
import type { BotSelf } from "./context";
import { type BotContext, handleUpdate } from "./router";
import { Sender } from "./sender";
import { loadBotState, saveBotState } from "./state";
import type { TgUser } from "./types";
import { profileOptions, selfOf, startingChats, wireCommunity } from "./wire";

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
  /** The worker's ETH price in dollars, for the community agent's launchpad figures; null without one. */
  ethUsd?: () => number | null;
  /** Tests pass a fake Claude client: nothing then reaches Anthropic. */
  claude?: ClaudeClient;
}

/** A press that posts a new message in a group: once per message and button in this long. */
const GROUP_POST_MS = 10 * 60_000;

/**
 * Starts tonkfun.fun's Telegram bot inside the worker when TELEGRAM_BOT_TOKEN
 * is set (telegram/config.ts), or returns null. It reads the worker's data and
 * answers; it holds no wallet key and never sends a transaction. Once getMe
 * has answered, the community agent and moderator (module 15) starts beside
 * it when its settings are in the environment (telegram/wire.ts).
 */
export async function startTelegram(deps: TelegramDeps): Promise<TelegramBot | null> {
  const { config, note } = loadTelegramConfig(deps.env, deps.snapshotPath);
  deps.log(note);
  if (!config) return null;
  // No secret reaches the logs: the bot token, and Anthropic's key when one is set.
  const redact = redactor([config.token, deps.env.ANTHROPIC_API_KEY?.trim() ?? ""].filter((secret) => secret !== ""));
  const log = (line: string) => deps.log(redact(line));
  const now = deps.now ?? Date.now;
  // The community's setup checks see what Telegram answers when a read fails (a 400 or 403 is certain; a 5xx isn't): community/setup-status.ts.
  const { api, watch: failures } = watchFailures(botApi(config.token, deps.fetchFn ?? fetch));
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
  let self: BotSelf | null = null;
  let inlineOn = false;
  /** Privacy mode (on by default): in groups Telegram shows the bot only its commands and replies to it. */
  let privacyMode = true;
  let refused = false;
  let stopped = false;
  const ctx: BotContext = {
    data: storeData(deps.store, now), out: senderOut(sender), site: config.site, now, log,
    bot: () => username, me: () => self, inline: () => inlineOn,
    // Inline: 5 per person in 10 s (pasting an address takes 2 or 3), so a few accounts can't use up the shared 10 a second.
    limiter: new Limiter(8, 10_000), inlineLimiter: new Limiter(5, 10_000), inlineAll: new Limiter(10, 1_000), pressAll: new Limiter(5, 1_000),
    groupPosts: createOnce(GROUP_POST_MS),
  };
  // When busy, the community groups' updates wait for a slot instead of being dropped: moderation must see them.
  // While the community agent starts, theirs (and the admin chat's) wait for it, 2 minutes at most; everything else is answered at once.
  const hold = startingChats(deps.env, deps.snapshotPath);
  const poller = new Poller(api, (update) => handleUpdate(update, ctx), log, undefined, undefined, { priority: (u) => ctx.community?.priority(u) === true, ...(hold ? { hold } : {}) });
  // Every 5 s, forget the chat and user IDs module 14's rate limits held: none past a minute. The privacy page's
  // keeps.memory line covers the community agent's own: user IDs, names, usernames and message text for 10 minutes at most.
  const sweep = setInterval(() => {
    const at = Date.now();
    for (const limiter of [ctx.limiter, ctx.inlineLimiter]) limiter.prune(at);
    ctx.groupPosts.prune(at);
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

  // Who the bot is, then polling at once beside the community agent's start, then the profile; a network failure retries, a refused token stops.
  void (async () => {
    for (let wait = 5_000; !refused && !stopped; wait = Math.min(300_000, wait * 2)) {
      try {
        const me = await api.call<TgUser>("getMe", {});
        // A reply without the bot's own ID can't be used: asked again, like a failed call.
        if (!Number.isSafeInteger(me?.id)) throw new TypeError("getMe gave no ID");
        inlineOn = me.supports_inline_queries === true;
        privacyMode = me.can_read_all_group_messages !== true;
        if (!privacyMode) log("privacy mode is off: in groups Telegram shows the bot every message (turn it back on with /setprivacy in @BotFather)");
        username = me.username ?? null;
        self = selfOf(me);
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
    if (!self || stopped) return;
    const botId = self.id;
    // Module 14 answers at once, however long the community's setup reads take when Telegram is slow.
    const polling = poller.run();
    // Set once the agent is in place: a change it hears of before then is covered by the first sync.
    let profile: ReturnType<typeof createProfileSync> | null = null;
    const community = await wireCommunity({
      env: deps.env, snapshotPath: deps.snapshotPath, sender, site: config.site, store: deps.store, ethUsd: deps.ethUsd ?? (() => null),
      me: ctx.me, channel: config.channelId, brandCreators: config.brandCreators, log, now, fetchFn: deps.fetchFn, client: deps.claude, failures,
      // A group dropped, the admin chat passed or community mode off after start: the menus and profile follow.
      onChange: () => profile?.run(),
    });
    if (stopped) {
      // Stopped while it started: its timers stop too (polling was stopped with the bot).
      community?.stop();
      await polling;
      return;
    }
    if (community) ctx.community = community;
    // What waited for it goes on now: to the agent, or to module 14 for a group it doesn't run (or with community mode off).
    poller.release();
    profile = createProfileSync({ sender, state, persist, log, botId, options: () => profileOptions(ctx.community ?? null, deps.env, deps.snapshotPath) });
    profile.run();
    await polling;
  })().catch((error: unknown) => {
    // A last resort: the worker keeps serving the screens even if the bot's loop fails.
    log(`the bot stopped: ${error instanceof Error ? error.name : "error"}`);
  });

  return {
    onFeedEvents: (events, timeOf) => channel?.onEvents(events, timeOf),
    afterTonkPoll: async (lag) => {
      await channel?.afterPoll(lag);
    },
    health: () => botHealth({ poller, sender, channel, community: ctx.community, username, inline: inlineOn, privacyMode }),
    save: async () => {
      await Promise.all([save(), ctx.community?.save().catch(() => log("community state not saved"))]);
    },
    stop: () => {
      stopped = true;
      clearInterval(sweep);
      poller.stop();
      ctx.community?.stop();
    },
  };
}
