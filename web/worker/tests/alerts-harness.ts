import type { AlertConfig } from "../src/alerts/config";
import { redactor } from "../src/alerts/deliver";
import { Dispatcher } from "../src/alerts/dispatcher";
import { freshState, serializeState } from "../src/alerts/state";
import { Watcher } from "../src/alerts/watcher";
import { FakeRpc, LAUNCHPAD, MIGRATOR, testConfig } from "./alerts-fixtures";

export const DEPLOYMENT = { chainId: 46630, launchpad: LAUNCHPAD, migrator: MIGRATOR };

/**
 * A watcher on the fake RPC (the recorded testnet chain), with a clock the
 * test moves (`advance`, and `drift` for time passing inside a cycle) and a
 * channel that keeps what it was sent.
 */
export function setup(overrides: Partial<AlertConfig> = {}) {
  let now = 1_800_000_000_000;
  let tickMs = 0;
  const clock = () => (now += tickMs);
  const sent: string[] = [];
  const logs: string[] = [];
  const pings: number[] = [];
  const saves: string[] = [];
  const config = testConfig(overrides);
  const state = freshState();
  const dispatcher = new Dispatcher([{ name: "test", maxLength: 4096, send: async (text) => void sent.push(text) }], { header: "tonkfun.fun · Robinhood Chain Testnet", repeatMs: config.repeatMs, dryRun: false, log: (line) => logs.push(line), now: clock }, state.dispatch);
  const rpc = new FakeRpc();
  const redact = redactor(config.secrets.concat(config.rpcUrl));
  const watcher = new Watcher(
    config,
    { rpc, dispatcher, log: (line) => logs.push(line), now: clock, save: async (s) => void saves.push(serializeState(s, DEPLOYMENT)), ping: async () => void pings.push(now), redact },
    state,
  );
  return { watcher, rpc, sent, logs, pings, saves, state, advance: (ms: number) => (now += ms), drift: (ms: number) => (tickMs = ms) };
}
