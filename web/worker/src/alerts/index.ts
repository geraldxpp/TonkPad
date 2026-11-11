import { log } from "../config";
import { every } from "../loop";
import { deliveryOf, type Env, loadAlertConfig } from "./config";
import { type Channel, type Fetch, ping, redactor, telegramChannel, webhookChannel } from "./deliver";
import { Dispatcher } from "./dispatcher";
import { HttpRpc } from "./rpc";
import { freshState, loadState, saveState } from "./state";
import { Watcher } from "./watcher";

/** What the worker holds on to: the watcher's /health block, and its state to save on shutdown. */
export interface Alerts {
  health: () => Record<string, unknown>;
  save: () => Promise<void>;
}

/**
 * Starts the launchpad watcher when the environment names a network and its
 * contracts (see the README's "Launchpad alerts"), or returns null and logs
 * why it's off. Alerts go to Telegram and/or a webhook when they are set,
 * and are only logged otherwise or with ALERT_DRY_RUN.
 */
export async function startAlerts(env: Env = process.env, fetchFn: Fetch = fetch): Promise<Alerts | null> {
  const { config, notes } = loadAlertConfig(env);
  for (const note of notes) log("alerts", note);
  if (!config) return null;
  const redact = redactor(config.secrets);
  const say = (line: string) => log("alerts", redact(line));
  const channels: Channel[] = config.dryRun
    ? []
    : [...(config.telegram ? [telegramChannel(config.telegram.token, config.telegram.chatId, fetchFn)] : []), ...(config.webhookUrl ? [webhookChannel(config.webhookUrl, fetchFn)] : [])];
  const deployment = { chainId: config.chainId, launchpad: config.launchpad, migrator: config.migrator };
  const saved = await loadState(config.statePath, deployment);
  const state = saved ?? freshState();
  const dispatcher = new Dispatcher(channels, { header: `tonkfun.fun · ${config.networkName}`, repeatMs: config.repeatMs, dryRun: config.dryRun, log: say, now: Date.now }, state.dispatch);
  const heartbeat = config.heartbeatUrl;
  const watcher = new Watcher(
    config,
    {
      rpc: new HttpRpc(config.rpcUrl),
      dispatcher,
      log: say,
      now: Date.now,
      save: (current) => saveState(config.statePath, current, deployment),
      ping: heartbeat ? () => ping(heartbeat, fetchFn) : null,
      redact,
    },
    state,
  );
  say(
    `watching ${config.networkName} (${config.chainId}): launchpad ${config.launchpad}, migrator ${config.migrator}; ` +
      `${saved ? `resuming after block ${saved.cursor}` : "no saved state, rebuilding"}; alerts go to: ${deliveryOf(config)}`,
  );
  every(config.pollMs, () => watcher.tick());
  // A cycle that hangs can't raise its own stall alert: this timer does.
  setInterval(() => {
    if (watcher.stuck()) void watcher.watchdog();
  }, 15_000);
  return { health: () => watcher.health(), save: () => watcher.save() };
}
