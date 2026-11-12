import type { MissionLockJson } from "@/shared/tonk/mission";
import { Batch, blockTime, head, one } from "../alerts/reads";
import { type AlertRpc, RpcFailure } from "../alerts/rpc";
import type { Address, RawLog } from "../alerts/types";
import { TOPICS } from "./abi";
import type { TonkBook } from "./book";
import type { LaunchFacts } from "./launch";
import type { TonkFeedConfig } from "./config";
import { decodeFeedLogs, type Sources, type TonkEvent } from "./events";
import { checkpointOf, devLockOf, type DevLockRow, guardedPoolId, logsWhere, missionOf, poolKeyOf } from "./reads";
import { checkGuard } from "./guard";
import { taxesOf, TxMoves } from "./wallets";

/** Blocks the feed stays behind the head, so a load-balanced RPC's slower nodes have every log it asks for. */
export const CONFIRMATIONS = 20;
/** Blocks per eth_getLogs (the public RPC serves 10,000); halved down to 10 while an RPC refuses a range. */
export const LOG_WINDOW = 10_000;
const MIN_WINDOW = 10;
/** Token addresses per Transfer query, and pool ids per Swap query. */
const PER_QUERY = 100;
/** How long one poll may spend catching up before the screens get their turn. */
const BUDGET_MS = 8_000;
const LOCK_TYPES = ["none", "time", "linear"] as const;

const chunks = <T>(items: readonly T[]): T[][] => Array.from({ length: Math.ceil(items.length / PER_QUERY) }, (_, i) => items.slice(i * PER_QUERY, (i + 1) * PER_QUERY));
const got = <T>(value: T | null, what: string): T => {
  if (value === null) throw new RpcFailure(`${what} reverted`);
  return value;
};

/** A dev lock as the launchpad stores it, or null without one (as the token page reads it). */
function lockJson(row: DevLockRow, checkpoint: bigint): MissionLockJson | null {
  const [type, lockedBps, start, end, total, claimed] = row;
  const kind = LOCK_TYPES[type] ?? "none";
  if (kind === "none" || total === BigInt(0)) return null;
  return { type: kind, lockedBps, start: Number(start), end: Number(end), total: String(total), claimed: String(claimed), checkpoint: String(checkpoint) };
}

/**
 * Follows tonkfun.fun's launchpad on Robinhood Chain from its deployment
 * block, keeping the whole history: launches, curve trades, graduations,
 * then each graduate's own pool, and every launch token's Transfers. Each
 * window of blocks is read whole (logs, then what they don't carry: block
 * times, stored briefs, dev locks, pool keys) and applied at once, so a
 * failed read leaves it to be read again and the snapshot never holds half
 * a window. `cursor` is the last block applied; the snapshot keeps it.
 */
export class TonkFeed {
  private window = LOG_WINDOW;
  /** The migrator's pool guard once checked; "refused" when it isn't the guarded hook on Uniswap's PoolManager. */
  private guard: Address | "refused" | null = null;

  constructor(
    private readonly rpc: AlertRpc,
    private readonly config: TonkFeedConfig,
    private readonly book: TonkBook,
    public cursor: number | null = null,
    private readonly now: () => number = Date.now,
    private readonly log: (line: string) => void = () => undefined,
  ) {}

  /** How far behind the head the last poll left the feed, in blocks. */
  lag = 0;

  /** Reads windows up to the head (less the confirmations) while the poll has time; returns what it applied. */
  async poll(): Promise<{ launches: number; trades: number }> {
    const started = this.now();
    const target = (await one(this.rpc, head())) - CONFIRMATIONS;
    if (this.cursor === null) this.cursor = this.config.startBlock - 1;
    if (this.guard === null) {
      this.guard = await checkGuard(this.rpc, this.config, target);
      if (this.guard === "refused") this.log("the migrator's pool guard isn't the guarded hook on Uniswap's PoolManager: graduated pools are not followed");
    }
    const applied = { launches: 0, trades: 0 };
    while (this.cursor < target && this.now() - started < BUDGET_MS) {
      const from = this.cursor + 1;
      const to = Math.min(target, from + this.window - 1);
      try {
        const counts = await this.readWindow(from, to);
        applied.launches += counts.launches;
        applied.trades += counts.trades;
        this.window = Math.min(LOG_WINDOW, this.window * 2);
      } catch (error) {
        this.window = Math.max(MIN_WINDOW, Math.floor(this.window / 2));
        throw error;
      }
    }
    this.lag = Math.max(0, target - this.cursor);
    return applied;
  }

  private async readWindow(from: number, to: number): Promise<{ launches: number; trades: number }> {
    const { launchpad, migrator, poolManager } = this.config;
    const ownRaw = await one(this.rpc, logsWhere(from, to, [launchpad, migrator]));
    const own = decodeFeedLogs(ownRaw, { launchpad, migrator, poolManager, isToken: () => false, isPool: () => false });
    const launches = own.filter((e): e is Extract<TonkEvent, { kind: "launched" }> => e.kind === "launched" && !this.book.isToken(e.token));
    const fresh = new Set<string>(launches.map((e) => e.token));

    // Each graduation's pool, by the migrator's own key for it (a second round trip, only when a launch graduated).
    const pools = new Map<string, { id: string; fee: number }>();
    const graduating = own.filter((e): e is Extract<TonkEvent, { kind: "poolLocked" }> => e.kind === "poolLocked");
    const guard = this.guard;
    if (graduating.length > 0 && guard !== null && guard !== "refused") {
      const batch = new Batch();
      const keys = graduating.map((e) => [e, batch.add(poolKeyOf(migrator, e.token, e.fee, to))] as const);
      await batch.run(this.rpc);
      for (const [e, key] of keys) {
        const id = guardedPoolId(key(), e.token, e.fee, guard);
        if (id) pools.set(e.token, { id, fee: e.fee });
      }
    }
    const poolIds = new Set([...this.book.poolIds(), ...[...pools.values()].map((pool) => pool.id)]);

    // Everything else the window needs, in one batch: Transfers, pool swaps, the new launches' records and dev locks.
    const batch = new Batch();
    const tokens = [...this.book.tokens(), ...launches.map((e) => e.token)];
    const transfers = chunks(tokens).map((part) => batch.add(logsWhere(from, to, part, [TOPICS.transfer])));
    const swaps = chunks([...poolIds]).map((ids) => batch.add(logsWhere(from, to, poolManager, [TOPICS.swap, ids as `0x${string}`[]])));
    const records = launches.map((e) => [e, batch.add(missionOf(launchpad, e.token, to))] as const);
    const lockTokens = new Set([...fresh, ...own.flatMap((e) => (e.kind === "lockChanged" && (fresh.has(e.token) || this.book.isToken(e.token)) ? [e.token] : []))]);
    const locks = [...lockTokens].map((token) => [token, batch.add(devLockOf(launchpad, token as Address, to)), batch.add(checkpointOf(launchpad, token as Address, to))] as const);
    await batch.run(this.rpc);
    const sources: Sources = { launchpad, migrator, poolManager, isToken: (a) => fresh.has(a) || this.book.isToken(a), isPool: (id) => poolIds.has(id) };
    const raw: RawLog[] = [...ownRaw, ...transfers.flatMap((part) => part()), ...swaps.flatMap((part) => part())];
    const events = decodeFeedLogs(raw, sources);

    // The exact time of every block with a launch, a trade or a graduation (logs here carry none).
    const timed = new Batch();
    const times = [...new Set(events.filter((e) => e.kind !== "transfer").map((e) => e.block))].map((block) => [block, timed.add(blockTime(block))] as const);
    await timed.run(this.rpc);
    const exact = new Map(times.map(([block, time]) => [block, time()]));
    const timeOf = (block: number) => (exact.get(block) ?? 0) * 1000;
    const facts = new Map(records.map(([e, record]) => {
      const mission = got(record(), "missions");
      return [e.token, { time: exact.get(e.block) ?? 0, agentPrompt: mission.agentPrompt, virtualEth: mission.virtualEth, virtualTokens: mission.virtualTokens } satisfies LaunchFacts];
    }));
    const lockRows = locks.map(([token, row, checkpoint]) => [token, lockJson(got(row(), "devLocks"), got(checkpoint(), "devVestedCheckpoint"))] as const);

    // Who really traded in each transaction, and what the launch-block shield took from a buy.
    const moves = new TxMoves(events.filter((e): e is Extract<TonkEvent, { kind: "transfer" }> => e.kind === "transfer"), this.book.system);
    const ctx = { pools, walletOf: moves.walletOf.bind(moves), taxOf: taxesOf(events) };

    // Applied in one go, with no await in between, so a snapshot never sees half of it.
    let launched = 0;
    let trades = 0;
    for (const e of launches) if (this.book.launch(e, facts.get(e.token) as LaunchFacts)) launched += 1;
    for (const e of events) {
      if (e.kind === "launched") continue;
      if (this.book.apply(e, timeOf(e.block), ctx) && (e.kind === "trade" || e.kind === "swap")) trades += 1;
    }
    for (const [token, lock] of lockRows) this.book.setLock(token, lock);
    this.cursor = to;
    return { launches: launched, trades };
  }
}
