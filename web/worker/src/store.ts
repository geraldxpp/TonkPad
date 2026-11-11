import type { ChainId } from "@/shared/types/chain";
import { artUrl, launchpadArt, repointArt } from "./art";
import { curveProgressFromPrice } from "./curve";
import { issuerByAuthorities } from "./issuers";
import {
  cleanName,
  cleanSymbol,
  type GraduationEvent,
  type LaunchEvent,
  newTrackedToken,
  NOT_ON_DEXSCREENER,
  type TrackedToken,
} from "./model";
import { refreshDelay } from "./schedule";
import type { AssetInfo } from "./sources/helius";
import type { MarketRequest, MarketResult } from "./sources/dexscreener";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Points kept in a token's market-cap history (thinned as it grows). */
export const SERIES_MAX = 60;
/** DAS needs a moment to index a new mint's metadata. */
const ASSET_FIRST_DELAY = 15_000;
/** Art still missing is looked up again every minute while the token is young. */
const ASSET_RETRY_EVERY = MINUTE;
const ASSET_RETRY_FOR = 30 * MINUTE;

/** Every token launched in the last day (plus today's graduates), in memory. */
export class TokenStore {
  private readonly tokens = new Map<string, TrackedToken>();

  get size(): number {
    return this.tokens.size;
  }

  all(): TrackedToken[] {
    return [...this.tokens.values()];
  }

  get(address: string): TrackedToken | undefined {
    return this.tokens.get(address);
  }

  addLaunch(event: LaunchEvent, nativeUsd: number | null): boolean {
    if (this.tokens.has(event.address)) return false;
    // Pump.fun serves a token's art within a second of launch, before Helius has looked it up.
    this.tokens.set(event.address, { ...newTrackedToken(event, nativeUsd), image: launchpadArt(event.address, event.launchpad) });
    return true;
  }

  /** Adds a token built elsewhere (Pons launches); false when it is already tracked. */
  add(token: TrackedToken): boolean {
    if (this.tokens.has(token.address)) return false;
    this.tokens.set(token.address, token);
    return true;
  }

  remove(address: string): void {
    this.tokens.delete(address);
  }

  markGraduated(event: GraduationEvent): void {
    const token = this.tokens.get(event.address);
    if (!token || token.graduated) return;
    token.graduated = true;
    token.graduatedAt = event.at;
    token.curve = 1;
    token.nextRefreshAt = event.at;
  }

  /** Applies a DexScreener result; a spoofed launch ("invalid") is dropped. */
  applyMarket(address: string, data: MarketResult, now: number): void {
    const token = this.tokens.get(address);
    if (!token) return;
    if (data === "invalid") {
      this.tokens.delete(address);
      return;
    }
    if (data) {
      token.priceUsd = data.priceUsd;
      token.marketCap = data.marketCap;
      token.liquidityUsd = data.liquidityUsd;
      token.windows = data.windows;
      token.dexId = data.dexId;
      token.pool = data.pool ?? token.pool ?? null;
      if (data.curvePool) token.curvePool = data.curvePool;
      token.marketAt = now;
      if (!data.onCurve && !token.graduated) {
        token.graduated = true;
        token.graduatedAt = now;
      }
      token.curve = token.graduated ? 1 : curveProgressFromPrice(data.priceNative);
      pushSample(token.mcapSeries, [now, data.marketCap], MINUTE, SERIES_MAX);
      token.buySamples.push([now, data.windows.h24.buys]);
      while (token.buySamples.length > 0 && token.buySamples[0][0] < now - 30 * MINUTE) token.buySamples.shift();
    }
    token.nextRefreshAt = now + refreshDelay(token, now);
  }

  applyAsset(address: string, info: AssetInfo | undefined, now: number): void {
    const token = this.tokens.get(address);
    if (!token) return;
    token.assetAt = now;
    if (!info) return;
    // Pump.fun tokens keep Pump.fun's own copy, so their art never switches URL.
    token.image = launchpadArt(address, token.launchpad) ?? (info.image ? artUrl(info.image, token.launchpad) : null);
    token.mintRevoked = info.mintRevoked;
    token.freezeRevoked = info.freezeRevoked;
    if (info.supply !== null) token.supply = info.supply;
    if (info.decimals !== undefined && info.decimals !== null) token.decimals = info.decimals;
    const claim = issuerByAuthorities(info.mintAuthority, info.freezeAuthority);
    if (claim !== (token.issuerClaim ?? null)) {
      // A new or dropped claim needs Jupiter's word again.
      token.issuerClaim = claim;
      token.issuer = null;
      token.issuerCheckedAt = 0;
    }
    // Some launch events arrive without a name or symbol; the metadata has them.
    if (!token.name && info.name) token.name = cleanName(info.name);
    if (!token.symbol && info.symbol) token.symbol = cleanSymbol(info.symbol);
  }

  /** Tokens whose refresh is due, most overdue first. */
  dueForRefresh(chain: ChainId, now: number, limit: number): MarketRequest[] {
    return this.all()
      .filter((t) => t.chain === chain && t.nextRefreshAt <= now)
      .sort((a, b) => a.nextRefreshAt - b.nextRefreshAt)
      .slice(0, limit)
      .map((t) => ({ address: t.address, launchpad: t.launchpad, launchedAt: t.createdAt, quote: t.pons?.quote }));
  }

  /** Tokens still without art and safety facts: visible ones first, then the newest. */
  needingAssets(chain: ChainId, visible: ReadonlySet<string>, limit: number, now: number): string[] {
    const due = (t: TrackedToken) =>
      t.assetAt === 0
        ? now - t.createdAt >= ASSET_FIRST_DELAY
        : t.image === null && now - t.assetAt >= ASSET_RETRY_EVERY && now - t.createdAt < ASSET_RETRY_FOR;
    const pending = this.all().filter((t) => t.chain === chain && due(t));
    pending.sort((a, b) => Number(visible.has(b.address)) - Number(visible.has(a.address)) || b.createdAt - a.createdAt);
    return pending.slice(0, limit).map((t) => t.address);
  }

  /** Drops tokens older than a day, unless they graduated within it. */
  prune(now: number): number {
    let removed = 0;
    for (const [address, t] of this.tokens) {
      const recentGraduate = t.graduatedAt !== null && now - t.graduatedAt < DAY;
      if (now - t.createdAt > DAY && !recentGraduate) {
        this.tokens.delete(address);
        removed++;
      }
    }
    return removed;
  }

  toJSON(): TrackedToken[] {
    return this.all();
  }

  restore(tokens: readonly TrackedToken[], now: number): void {
    for (const t of tokens) {
      const image = t.image ? repointArt(t.image, t.launchpad) : t.assetAt > 0 ? launchpadArt(t.address, t.launchpad) : null;
      const nextRefreshAt = t.pons && !t.graduated ? NOT_ON_DEXSCREENER : now;
      this.tokens.set(t.address, { ...t, image, nextRefreshAt });
    }
    this.prune(now);
  }
}

/** Appends a point at most once per `every` ms and thins the older half past `max`. */
export function pushSample(series: Array<[number, number]>, point: [number, number], every: number, max: number): void {
  const last = series[series.length - 1];
  if (last && point[0] - last[0] < every) {
    series[series.length - 1] = [last[0], point[1]];
    return;
  }
  series.push(point);
  if (series.length > max) {
    const half = Math.floor(series.length / 2);
    const thinned = series.slice(0, half).filter((_, i) => i % 2 === 0);
    series.splice(0, half, ...thinned);
  }
}
