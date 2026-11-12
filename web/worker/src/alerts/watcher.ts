import { type Alert, type AlertContext, short } from "./alert";
import { RECONCILE_PER_CHECK, runCheck } from "./check";
import { type AlertConfig, deliveryOf } from "./config";
import type { Dispatcher } from "./dispatcher";
import { runDryRuns } from "./dryrun";
import { headStuckAlert, healthOf, lagAlert, snapshotOf, stallAlert, summaryAlert } from "./heartbeat";
import { blockTime, head, one } from "./reads";
import type { AlertRpc } from "./rpc";
import { taxIntoCurve } from "./settings";
import type { WatcherState } from "./state";
import type { Address } from "./types";
import { LOG_WINDOW, readWindows } from "./window";

/** Blocks the watcher stays behind the RPC's head, so a load-balanced RPC's slower nodes have every log it asks for. */
export const CONFIRMATIONS = 20;
const CATCH_UP_MS = 8_000;
const REBUILD_MS = 25_000;
const DRY_RUN_EVERY_MS = 60_000;
/** Settings (and the rotation of rows) are read every 30 s; balances and touched rows every cycle. */
const SETTINGS_EVERY_MS = 30_000;
const HEAD_STUCK_MS = 5 * 60_000;
const SAVE_EVERY_MS = 15_000;
const PING_EVERY_MS = 60_000;

export interface WatcherDeps {
  rpc: AlertRpc;
  dispatcher: Dispatcher;
  log: (line: string) => void;
  now: () => number;
  save: (state: WatcherState) => Promise<void>;
  /** The dead man's switch (ALERT_HEARTBEAT_URL), or null. */
  ping: (() => Promise<void>) | null;
  redact: (text: string) => string;
}

const message = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

/**
 * Follows the launchpad and the migrator block by block. Each cycle reads the
 * new logs (each window applied whole or not at all, raising its event
 * alerts), then checks solvency, settings and integrity at the newest block,
 * runs the graduation dry runs once a minute, and watches itself: lag, a stall,
 * a stuck head. A first start rebuilds the ledger from the deployment block
 * without alerting on history.
 */
export class Watcher {
  private rebuildUntil: number | null = null;
  private announced = false;
  private head: number | null = null;
  private headMovedAt: number;
  private lastSuccessAt: number | null = null;
  private lastError: string | null = null;
  private lastErrorLogAt = 0;
  private secondsPerBlock: number | null = null;
  private readonly reading = { window: LOG_WINDOW };
  private lastDryRunAt = 0;
  private lastSettingsAt = 0;
  private rotation = 0;
  private lastSaveAt = 0;
  private lastPingAt = 0;
  private busySince: number | null = null;
  private readonly codes = new Map<Address, boolean>();
  private readonly startedAt: number;
  private readonly resumedFrom: number | null;

  constructor(
    private readonly config: AlertConfig,
    private readonly deps: WatcherDeps,
    public readonly state: WatcherState,
  ) {
    this.startedAt = deps.now();
    this.headMovedAt = this.startedAt;
    this.resumedFrom = state.cursor;
  }

  private ctx(): AlertContext {
    const { missions } = this.state.ledger;
    const token = (address: Address) => {
      const ticker = missions.get(address)?.ticker;
      return ticker ? `$${ticker} (${short(address)})` : short(address);
    };
    return { explorerUrl: this.config.explorerUrl, launchpad: this.config.launchpad, migrator: this.config.migrator, token };
  }

  /** One poll. Never throws: a failure is logged, and a long run of them raises the stall alert. */
  async tick(): Promise<void> {
    this.busySince = this.deps.now();
    try {
      await this.cycle();
    } catch (error) {
      this.lastError = this.deps.redact(message(error)).slice(0, 200);
      const now = this.deps.now();
      if (now - this.lastErrorLogAt >= 60_000) {
        this.lastErrorLogAt = now;
        this.deps.log(`check failed: ${this.lastError}`);
      }
      await this.watchdog();
    } finally {
      this.busySince = null;
    }
  }

  /** Raises the stall alert once no cycle has succeeded for ALERT_MAX_LAG_SECONDS; also run on its own timer in case a cycle hangs. */
  async watchdog(): Promise<void> {
    const since = this.deps.now() - (this.lastSuccessAt ?? this.startedAt);
    if (since <= this.config.maxLagSeconds * 1000) return;
    await this.deps.dispatcher.dispatch([stallAlert(since, this.lastError)], [], this.state.cursor).catch(() => undefined);
  }

  /** Whether a cycle has been running longer than the lag limit (the timer's cue to raise the stall alert itself). */
  stuck(): boolean {
    return this.busySince !== null && this.deps.now() - this.busySince > this.config.maxLagSeconds * 1000;
  }

  private async cycle(): Promise<void> {
    const { rpc } = this.deps;
    const now = this.deps.now();
    const top = await one(rpc, head());
    if (top !== this.head) [this.head, this.headMovedAt] = [top, now];
    if (this.secondsPerBlock === null) {
      const [t1, t0, taxStays] = await Promise.all([one(rpc, blockTime(top)), one(rpc, blockTime(Math.max(0, top - 10_000))), taxIntoCurve(rpc, this.config.launchpad, top)]);
      // Where the launch-block tax goes is read from the deployed code before any event is applied.
      [this.secondsPerBlock, this.state.ledger.taxIntoCurve] = [Math.max((t1 - t0) / 10_000, 0.01), taxStays];
      this.deps.log(taxStays ? "launch-block tax: kept in the curve (the testnet release before F-1)" : "launch-block tax: burned (the F-1/F-2 build)");
    }
    const target = top - CONFIRMATIONS;
    if (this.state.cursor === null) {
      this.state.cursor = this.config.startBlock - 1;
      this.rebuildUntil = target;
      this.deps.log(`rebuilding from the deployment block ${this.config.startBlock}; history raises no alerts`);
    }
    const alerts: Alert[] = [];
    const evaluated: string[] = [];
    let failure: unknown = null;
    try {
      const budget = this.rebuildUntil !== null ? REBUILD_MS : CATCH_UP_MS;
      await readWindows(rpc, this.config, this.state, this.reading, alerts, {
        top,
        target,
        history: this.rebuildUntil,
        inBudget: () => this.deps.now() - now < budget,
        ctx: () => this.ctx(),
        afterWindow: () => (this.rebuildUntil !== null ? this.maybeSave(this.deps.now(), false) : Promise.resolve()),
      });
      if (this.state.cursor >= target) {
        const ctx = this.ctx();
        const withSettings = now - this.lastSettingsAt >= SETTINGS_EVERY_MS;
        const check = await runCheck(rpc, this.config, this.state, this.state.cursor, ctx, this.rotation, this.codes, withSettings);
        if (withSettings) [this.lastSettingsAt, this.rotation] = [now, this.rotation + RECONCILE_PER_CHECK];
        alerts.push(...check.alerts);
        evaluated.push(...check.evaluated);
        if (now - this.lastDryRunAt >= DRY_RUN_EVERY_MS) {
          const dry = await runDryRuns(rpc, this.config, this.state, this.state.cursor, ctx);
          alerts.push(...dry.alerts);
          evaluated.push(...dry.evaluated);
          this.lastDryRunAt = now;
        }
        alerts.push(...this.summaries(now));
      }
    } catch (error) {
      // Whatever the windows already raised still goes out; the failure is then reported as usual.
      failure = error;
    }
    if (failure === null) {
      const lag = this.rebuildUntil === null ? lagAlert((top - this.state.cursor) * this.secondsPerBlock, this.config.maxLagSeconds, this.state.cursor, top) : null;
      if (lag) alerts.push(lag);
      if (now - this.headMovedAt > HEAD_STUCK_MS) alerts.push(headStuckAlert(top, now - this.headMovedAt));
      evaluated.push("stalled", "head-stuck", ...(this.rebuildUntil === null ? ["lag"] : []));
      [this.lastSuccessAt, this.lastError] = [now, null];
    }
    await this.deps.dispatcher.dispatch(alerts, evaluated, this.state.cursor);
    await this.maybeSave(now, alerts.length > 0);
    if (failure !== null) throw failure;
    if (this.deps.ping && now - this.lastPingAt >= PING_EVERY_MS) {
      this.lastPingAt = now;
      await this.deps.ping().catch((error: unknown) => this.deps.log(`heartbeat: ${this.deps.redact(message(error))}`));
    }
  }

  /** The start-up message once caught up, then the periodic all-clear. */
  private summaries(now: number): Alert[] {
    const due = !this.announced || (this.config.summaryMs > 0 && now - (this.state.lastSummaryAt ?? 0) >= this.config.summaryMs);
    if (!due || !this.state.settings) return [];
    const how = this.rebuildUntil !== null ? `Rebuilt from the deployment block ${this.config.startBlock}` : this.resumedFrom !== null ? `Resumed from block ${this.resumedFrom}` : "Started";
    const snapshot = snapshotOf(this.state, this.config.checkFromBps, this.codes, deliveryOf(this.config));
    const alert = summaryAlert(this.announced ? "summary" : "startup", snapshot, now, how);
    [this.announced, this.rebuildUntil, this.state.lastSummaryAt] = [true, null, now];
    return [alert];
  }

  private async maybeSave(now: number, force: boolean): Promise<void> {
    if (!force && now - this.lastSaveAt < SAVE_EVERY_MS) return;
    this.lastSaveAt = now;
    await this.deps.save(this.state).catch((error: unknown) => this.deps.log(`state not saved: ${this.deps.redact(message(error))}`));
  }

  /** Saves now (on shutdown). */
  save(): Promise<void> {
    return this.maybeSave(this.deps.now(), true);
  }

  /** For the worker's public /health: positions and times only, never a setting or a secret. */
  health(): Record<string, unknown> {
    return healthOf(this.config, this.state, { head: this.head, rebuilding: this.rebuildUntil !== null, lastCheckAt: this.lastSuccessAt, unsent: this.deps.dispatcher.waiting() });
  }
}
