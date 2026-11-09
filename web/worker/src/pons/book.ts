import { artUrl } from "../art";
import { cleanName, cleanSymbol, newTrackedToken, NOT_ON_DEXSCREENER } from "../model";
import type { PonsGraduation, PonsLaunch, PonsTrade } from "../sources/pons";
import { pushSample, SERIES_MAX, type TokenStore } from "../store";
import { newTradeBook, recordTrades } from "../trades/book";
import { applyCurveTrade, newPonsState, PONS_SUPPLY, ponsProgress, ponsSpot, ponsWindows, trimTrades } from "./curve";
import { ponsHolders, trackHolders } from "./holders";

const MINUTE = 60_000;
const units = (raw: bigint, decimals: number) => Number(raw) / 10 ** decimals;

export interface PonsMeta {
  name: string | null;
  symbol: string | null;
  logo: string | null;
}

/**
 * Pons tokens in the store: launches, curve trades and graduations go in;
 * price, market cap, curve progress and windows come out of the curve itself
 * until graduation, when DexScreener takes over.
 */
export class PonsBook {
  /** Curve contract → token address, so trades from unknown contracts are ignored. */
  private readonly curves = new Map<string, string>();

  /** `quoteUsd` prices each trade in USD as it happens, when the quote asset's price is known. */
  constructor(
    private readonly store: TokenStore,
    private readonly quoteUsd: (quote: string) => number | null = () => null,
  ) {
    this.reindex();
  }

  /** Rebuilds the curve index from the store (after a restore or a prune). */
  reindex(): void {
    this.curves.clear();
    for (const t of this.store.all()) if (t.pons) this.curves.set(t.pons.curve, t.address);
  }

  launch(event: PonsLaunch, quoteDecimals: number): boolean {
    const token = newTrackedToken(
      {
        address: event.token,
        chain: "rh",
        launchpad: "pons",
        name: "",
        symbol: "",
        creator: event.creator,
        createdAt: event.at,
        creatorBuyShare: 0,
        marketCapNative: null,
      },
      null,
    );
    token.pons = newPonsState({
      curve: event.curve,
      quote: event.quote,
      quoteDecimals,
      threshold: units(event.threshold, quoteDecimals),
      launchTx: event.tx,
    });
    // The standard launch config deploys a fixed-supply ERC-20 with no mint,
    // pause, blacklist or owner functions (checked on its contract code).
    const standard = event.configId === BigInt(0);
    token.mintRevoked = standard ? true : null;
    token.freezeRevoked = standard ? true : null;
    token.assetAt = event.at; // art and names come from the token contract, not Helius
    token.nextRefreshAt = NOT_ON_DEXSCREENER;
    if (!this.store.add(token)) return false;
    this.curves.set(event.curve, event.token);
    return true;
  }

  meta(address: string, meta: PonsMeta): void {
    const token = this.store.get(address);
    if (!token) return;
    if (meta.name) token.name = cleanName(meta.name);
    if (meta.symbol) token.symbol = cleanSymbol(meta.symbol);
    if (meta.logo) token.image = artUrl(meta.logo, "pons");
  }

  /** Applies a curve trade; false when it isn't from a known curve still trading. */
  trade(event: PonsTrade): boolean {
    const address = this.curves.get(event.curve);
    const token = address ? this.store.get(address) : undefined;
    const pons = token?.pons;
    if (!token || !pons || token.graduated) return false;
    const d = pons.quoteDecimals;
    const tokens = units(event.tokenAmount, 18);
    // Buys credit the recipient (routers name the user there); a sell is the trader's when it held tokens, else the recipient's.
    const wallet = event.side === "buy" || !((pons.balances?.[event.trader] ?? 0) > 0) ? event.recipient : event.trader;
    applyCurveTrade(pons, {
      buy: event.side === "buy",
      quote: units(event.quoteAmount, d),
      tokens,
      fee: units(event.fee, d),
      tax: units(event.tax, d),
      at: event.at,
    });
    trackHolders(pons, { buy: event.side === "buy", trader: event.trader, recipient: event.recipient, tokens });
    const quote = units(event.quoteAmount, d);
    const usd = this.quoteUsd(pons.quote);
    recordTrades((pons.book ??= newTradeBook()), [{
      id: `${event.tx}:${event.side}:${event.tokenAmount}`,
      tx: event.tx,
      at: event.at,
      side: event.side,
      wallet,
      tokens,
      native: quote,
      usd: usd === null ? null : quote * usd,
      marketCap: usd === null ? null : ponsSpot(pons) * PONS_SUPPLY * usd,
    }]);
    // The creator's first buy goes through the launch router, in the launch transaction.
    if (event.side === "buy" && event.tx === pons.launchTx) {
      token.creatorBuyShare = Math.min(1, token.creatorBuyShare + tokens / PONS_SUPPLY);
    }
    return true;
  }

  graduate(event: PonsGraduation): void {
    const address = event.token ?? (event.curve ? this.curves.get(event.curve) : undefined);
    if (address) this.store.markGraduated({ address, at: event.at });
  }

  /** Quote assets of tokens still on their curve. */
  quotes(): Set<string> {
    const out = new Set<string>();
    for (const t of this.store.all()) if (t.pons && !t.graduated) out.add(t.pons.quote);
    return out;
  }

  /** Drops every Pons token (when the feed has to rebuild them from the chain). */
  clear(): void {
    for (const t of this.store.all()) if (t.pons) this.store.remove(t.address);
    this.curves.clear();
  }

  /** Price, market cap, curve progress and windows for every token still on its curve. */
  refresh(now: number, quoteUsd: (quote: string) => number | null): void {
    for (const token of this.store.all()) {
      const pons = token.pons;
      if (!pons || token.graduated) continue;
      trimTrades(pons, now);
      token.curve = ponsProgress(pons);
      const holders = ponsHolders(pons);
      if (holders) {
        token.holderCount = holders.count;
        token.top10Share = holders.top10Share;
      }
      const usd = quoteUsd(pons.quote);
      if (usd === null) continue; // priced once the quote asset's price is known
      const spot = ponsSpot(pons);
      token.priceUsd = spot * usd;
      token.marketCap = spot * PONS_SUPPLY * usd;
      token.windows = ponsWindows(pons, usd, now);
      token.marketAt = now;
      pushSample(token.mcapSeries, [now, token.marketCap], MINUTE, SERIES_MAX);
    }
  }
}
