import { curveFilled } from "@/shared/tonk/curve";
import type { MissionLockJson } from "@/shared/tonk/mission";
import type { Address } from "../alerts/types";
import { pushSample, SERIES_MAX, type TokenStore } from "../store";
import type { TonkEvent } from "./events";
import { applyTransfer, holderFigures, type SystemAddresses } from "./holders";
import { hasAgent, type LaunchFacts, launchedToken, tonkArt, type TonkToken } from "./launch";
import { curvePrice, ethOf, poolPrice, recordTrade, SUPPLY, type TonkState, tonkWindows, trimTrades } from "./state";
import { recordFlow } from "./traders";

const MINUTE = 60_000;
const ZERO = BigInt(0);

type Of<K extends TonkEvent["kind"]> = Extract<TonkEvent, { kind: K }>;

/** What a window adds to its events: the pools it graduated, who really traded, and what the launch-block shield took. */
export interface ApplyContext {
  pools: ReadonlyMap<string, { id: string; fee: number }>;
  walletOf: (tx: string, token: string, buy: boolean, named: string) => string;
  taxOf: (tx: string, token: string, buyer: string) => bigint;
}

/** Wallets remembered as the shield's snipers, per launch. */
const SNIPERS = 50;

function noteSniper(s: TonkState, sniper: string): void {
  const snipers = (s.snipers ??= []);
  if (snipers.length < SNIPERS && !snipers.includes(sniper)) snipers.push(sniper);
}

/**
 * tonkfun.fun's launches in the store. Launches, curve trades, the
 * graduation, its pool's swaps and every token Transfer go in; price, market
 * cap, curve progress, windows and holders come out, from the chain alone
 * (never DexScreener, which could list a look-alike pool).
 */
export class TonkBook {
  /** Pool id → token, for graduated launches. */
  private readonly pools = new Map<string, Address>();

  constructor(
    private readonly store: TokenStore,
    readonly system: SystemAddresses,
  ) {
    this.reindex();
  }

  /** Rebuilds the pool index from the store (after a restore). */
  reindex(): void {
    this.pools.clear();
    for (const t of this.store.all()) if (t.tonk?.pool) this.pools.set(t.tonk.pool.id, t.address as Address);
  }

  private tracked(address: string): TonkToken | null {
    const token = this.store.get(address);
    return token?.tonk ? (token as TonkToken) : null;
  }

  isToken = (address: string): boolean => this.tracked(address) !== null;
  isPool = (id: string): boolean => this.pools.has(id);
  tokens = (): Address[] => this.store.all().flatMap((t) => (t.tonk ? [t.address as Address] : []));
  poolIds = (): string[] => [...this.pools.keys()];
  get size(): number {
    return this.tokens().length;
  }

  launch(e: Of<"launched">, facts: LaunchFacts): boolean {
    return !this.store.get(e.token) && this.store.add(launchedToken(e, facts));
  }

  /** Applies one event at its block's time (ms); launches are applied first, by `launch`. */
  apply(e: TonkEvent, at: number, ctx: ApplyContext): boolean {
    switch (e.kind) {
      case "trade":
        return this.trade(e, at, ctx);
      case "bundleTax": {
        const t = this.tracked(e.token);
        if (t) noteSniper(t.tonk, e.sniper);
        return t !== null;
      }
      case "graduated": {
        const t = this.tracked(e.token);
        if (!t || t.graduated) return false;
        t.graduated = true;
        t.graduatedAt = at;
        t.curve = 1;
        return true;
      }
      case "poolLocked": {
        const t = this.tracked(e.token);
        const pool = ctx.pools.get(e.token);
        if (!t || !pool || t.tonk.pool) return false;
        t.tonk.pool = pool;
        this.pools.set(pool.id, t.address as Address);
        // The pool opens at the migrator's seed; its swaps take over from there.
        if (e.tokensSeeded > ZERO) t.tonk.spot = Number(e.ethSeeded) / Number(e.tokensSeeded);
        return true;
      }
      case "swap":
        return this.swap(e, at, ctx);
      case "transfer": {
        const t = this.tracked(e.token);
        if (t) applyTransfer(t.tonk, e.from, e.to, e.value);
        return t !== null;
      }
      case "metadata": {
        const t = this.tracked(e.token);
        if (!t) return false;
        t.tonk.agent = hasAgent(e.agentPrompt);
        t.image = tonkArt(e.metadataUri);
        return true;
      }
      default:
        return false;
    }
  }

  private trade(e: Of<"trade">, at: number, ctx: ApplyContext): boolean {
    const t = this.tracked(e.token);
    if (!t || t.graduated) return false;
    const s = t.tonk;
    if (s.trades.length === 0) {
      // The curve's opening price: the reserves just before its first trade.
      const net = e.gross - e.fees;
      s.startPrice = e.isBuy ? curvePrice(e.virtualEth - net, e.virtualTokens + e.tokens) : curvePrice(e.virtualEth + e.gross, e.virtualTokens - e.tokens);
    }
    // The creator's buy inside the launch, in the launch transaction (the lock is worked out from it).
    if (e.isBuy && e.tx === s.launchTx && e.trader === t.creator && s.devBought === "0") {
      s.devBought = String(e.tokens);
      t.creatorBuyShare = Math.min(1, ethOf(e.tokens) / SUPPLY);
    }
    s.virtualEth = String(e.virtualEth);
    s.virtualTokens = String(e.virtualTokens);
    s.tokensLeft = String(e.left);
    s.realEth = String(BigInt(s.realEth) + (e.isBuy ? e.gross - e.fees : -e.gross));
    recordTrade(s, at, e.isBuy, ethOf(e.gross), curvePrice(e.virtualEth, e.virtualTokens));
    // A buy cost its gross ETH plus any launch-block tax; a sell paid out its gross less the fees.
    const paid = e.isBuy ? e.gross + ctx.taxOf(e.tx, e.token, e.trader) : e.gross - e.fees;
    recordFlow(s, ctx.walletOf(e.tx, e.token, e.isBuy, e.trader), e.isBuy, ethOf(paid), ethOf(e.tokens));
    return true;
  }

  private swap(e: Of<"swap">, at: number, ctx: ApplyContext): boolean {
    const address = this.pools.get(e.pool);
    const t = address ? this.tracked(address) : null;
    if (!t || (e.amount0 === ZERO && e.amount1 === ZERO)) return false;
    // The swapper's deltas: a buy pays ETH in (negative) and takes tokens out.
    const buy = e.amount0 < ZERO;
    const [eth, tokens] = buy ? [-e.amount0, e.amount1] : [e.amount0, -e.amount1];
    recordTrade(t.tonk, at, buy, ethOf(eth), poolPrice(e.sqrtPriceX96));
    recordFlow(t.tonk, ctx.walletOf(e.tx, t.address, buy, e.sender), buy, ethOf(eth), ethOf(tokens));
    return true;
  }

  /** The dev lock as stored at the window's last block. */
  setLock(address: string, lock: MissionLockJson | null): void {
    const t = this.tracked(address);
    if (t) t.tonk.lock = lock;
  }

  /** Price, market cap, curve progress, windows and holders for every launch, at the ETH price now. */
  refresh(now: number, ethUsd: number | null): void {
    for (const t of this.store.all()) {
      const s = t.tonk;
      if (!s) continue;
      trimTrades(s, now);
      t.curve = t.graduated ? 1 : curveFilled(BigInt(s.tokensLeft));
      if (s.holdersDirty !== false) {
        const figures = holderFigures(s, this.system);
        t.holderCount = figures.count;
        t.top10Share = figures.top10Share;
        s.holdersDirty = false;
      }
      if (ethUsd === null || !Number.isFinite(ethUsd) || ethUsd <= 0) continue; // priced once the ETH price is known
      t.priceUsd = s.spot * ethUsd;
      t.marketCap = s.spot * SUPPLY * ethUsd;
      t.windows = tonkWindows(s, ethUsd, now);
      t.liquidityUsd = t.graduated ? null : ethOf(BigInt(s.realEth)) * ethUsd;
      t.marketAt = now;
      pushSample(t.mcapSeries, [now, t.marketCap], MINUTE, SERIES_MAX);
    }
  }
}
