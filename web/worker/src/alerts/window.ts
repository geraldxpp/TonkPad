import { MIGRATOR_VIEWS } from "./abi";
import type { Alert, AlertContext } from "./alert";
import type { AlertConfig } from "./config";
import { type ChainEvent, decodeLogs } from "./events";
import { graduatingTxs, graduationAlerts, type PoolSetup } from "./graduation";
import { outflowAlerts } from "./outflows";
import { ownerEventAlerts } from "./owner";
import { Batch, logs, one, receipt, transaction, view } from "./reads";
import type { AlertRpc } from "./rpc";
import { safeAlerts } from "./safe";
import type { Settings } from "./settings";
import type { WatcherState } from "./state";
import { type Address, lower, type RawLog, type RawReceipt, type RawTx } from "./types";

const ZERO = BigInt(0);
const ADDRESS = /^0x[0-9a-f]{40}$/;
/** Blocks per eth_getLogs (Robinhood Chain's public RPC serves 10,000); halved down to 10 while an RPC refuses a range. */
export const LOG_WINDOW = 10_000;
const MIN_WINDOW = 10;

/** What a window's alerts need beyond its logs. */
export interface WindowFacts {
  receipts: Map<string, RawReceipt | null>;
  txs: Map<string, RawTx>;
  pool: PoolSetup | null;
}

/** The Uniswap contracts and guard a graduation must use, as the migrator names them. */
function poolSetupOf(settings: Settings | null): PoolSetup | null {
  const [poolManager, positionManager, guard] = ["migrator.poolManager", "migrator.positionManager", "migrator.initializationGuard"].map((key) => settings?.[key] ?? "");
  if (![poolManager, positionManager, guard].every((value) => ADDRESS.test(value))) return null;
  return { poolManager: lower(poolManager), positionManager: lower(positionManager), guard: lower(guard) };
}

/**
 * Fetches, in one batch, what a window's logs don't carry: the receipt of
 * each graduating transaction, the value of each curve-completing buy (its
 * refund) and a plain Safe's calldata. Nothing is applied until this has
 * succeeded, so a failed fetch leaves the window to be read again whole.
 */
export async function windowFacts(rpc: AlertRpc, config: AlertConfig, events: readonly ChainEvent[], settings: Settings | null, block: number): Promise<WindowFacts> {
  const graduating = graduatingTxs(events);
  const launches = new Set(events.flatMap((e) => (e.source === "launchpad" && e.kind === "launched" ? [e.tx] : [])));
  const completing = events.flatMap((e) => (e.source === "launchpad" && e.kind === "trade" && e.isBuy && e.remaining === ZERO && !launches.has(e.tx) ? [e.tx] : []));
  const logged = new Map<string, boolean>();
  for (const e of events) if (e.source === "safe") logged.set(e.tx, (logged.get(e.tx) ?? false) || e.kind === "safeTx" || e.kind === "safeModuleTx");
  const plainSafe = [...logged].filter(([, hasCall]) => !hasCall).map(([tx]) => tx);

  const batch = new Batch();
  const receipts = [...graduating.keys()].map((hash) => [hash, batch.add(receipt(hash))] as const);
  const txs = [...new Set([...completing, ...plainSafe])].map((hash) => [hash, batch.add(transaction(hash))] as const);
  // Before the first check there are no settings yet: the migrator's three immutables are read here instead.
  const pool = poolSetupOf(settings);
  const fallback = !pool && graduating.size > 0 ? (["poolManager", "positionManager", "initializationGuard"] as const).map((fn) => batch.add(view(config.migrator, MIGRATOR_VIEWS, fn, [], block, (r) => String(r).toLowerCase()))) : null;
  await batch.run(rpc);

  const facts: WindowFacts = { receipts: new Map(receipts.map(([hash, get]) => [hash, get()])), txs: new Map(), pool };
  for (const [hash, get] of txs) {
    const tx = get();
    if (tx) facts.txs.set(hash, tx);
  }
  if (fallback) {
    const [poolManager, positionManager, guard] = fallback.map((get) => get() ?? "");
    facts.pool = poolSetupOf({ "migrator.poolManager": poolManager, "migrator.positionManager": positionManager, "migrator.initializationGuard": guard });
  }
  return facts;
}

/**
 * The alerts one window of events raises on its own: owner events, an owner
 * Safe's transactions, graduations and large outflows. `taxBurned` is the
 * deployment's launch-block tax rule (see Ledger.taxIntoCurve).
 */
export function windowAlerts(config: AlertConfig, events: readonly ChainEvent[], facts: WindowFacts, curveEthBefore: ReadonlyMap<Address, bigint>, settings: Settings | null, ctx: AlertContext, taxBurned: boolean): Alert[] {
  if (events.length === 0) return [];
  const fee = settings?.["launchpad.launchFee"];
  const launchFee = fee && /^\d+$/.test(fee) ? BigInt(fee) : null;
  return [
    ...ownerEventAlerts(events, ctx),
    ...safeAlerts(events, facts.txs, ctx),
    ...(facts.pool ? graduationAlerts(events, facts.receipts, ctx, facts.pool) : []),
    ...outflowAlerts(events, { curveEthBefore, txs: facts.txs, launchFee, taxBurned }, config.largeOutflowWei, ctx),
  ];
}

/**
 * One window of logs, applied whole: what its alerts need is fetched first,
 * then its events go into the ledger and its alerts are worded. If the fetch
 * fails nothing is applied, so the window is read again whole. Events up to
 * `history` (a rebuild's starting head) are applied but raise nothing.
 */
export async function applyWindow(rpc: AlertRpc, config: AlertConfig, state: WatcherState, raw: readonly RawLog[], top: number, history: number | null, ctx: () => AlertContext): Promise<Alert[]> {
  const events = decodeLogs(raw, config.launchpad, config.migrator, new Set(state.safes));
  const live = history === null ? events : events.filter((event) => event.block > history);
  const facts = live.length > 0 ? await windowFacts(rpc, config, live, state.settings, top) : null;
  const before = new Map<Address, bigint>();
  for (const event of events) {
    const applied = state.ledger.apply(event);
    if (applied && event.source === "launchpad" && event.kind === "graduated") before.set(event.token, applied.curveEthBefore);
  }
  return facts ? windowAlerts(config, live, facts, before, state.settings, ctx(), !state.ledger.taxIntoCurve) : [];
}

export interface WindowOptions {
  top: number;
  target: number;
  /** A rebuild's starting head: events up to it raise nothing. */
  history: number | null;
  inBudget: () => boolean;
  ctx: () => AlertContext;
  afterWindow: () => Promise<void>;
}

/**
 * Reads windows of logs from the cursor to `target` while the cycle has time,
 * each applied whole, pushing their alerts into `alerts` as it goes (so a
 * later failure still lets them out). The window halves while the RPC refuses
 * a range and grows back after each success.
 */
export async function readWindows(rpc: AlertRpc, config: AlertConfig, state: WatcherState, reading: { window: number }, alerts: Alert[], options: WindowOptions): Promise<void> {
  while ((state.cursor ?? options.target) < options.target && options.inBudget()) {
    const from = (state.cursor ?? options.target) + 1;
    const to = Math.min(options.target, from + reading.window - 1);
    let raw: RawLog[];
    try {
      raw = await one(rpc, logs(from, to, [config.launchpad, config.migrator, ...state.safes]));
      reading.window = Math.min(LOG_WINDOW, reading.window * 2);
    } catch (error) {
      reading.window = Math.max(MIN_WINDOW, Math.floor(reading.window / 2));
      throw error;
    }
    alerts.push(...(await applyWindow(rpc, config, state, raw, options.top, options.history, options.ctx)));
    state.cursor = to;
    await options.afterWindow();
  }
}
