// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PonsBook } from "../src/pons/book";
import { PONS_SUPPLY, ponsSpot } from "../src/pons/curve";
import { parsePonsLog, type PonsLaunch, type PonsTrade } from "../src/sources/pons";
import { TokenStore } from "../src/store";
import { newTradeBook, recordTrades, type TradeRecord } from "../src/trades/book";
import { tokenView } from "../src/views/token";
import { NOW, priced } from "./fixtures";
import { LOGS, timeOf, TOKEN } from "./pons-fixtures";

const status = { solUsd: 100, ethUsd: 3_000, rhGasGwei: null };
const SOL_MINT = "So11111111111111111111111111111111111111112";

function ponsWithTrades(quoteUsd: number | null) {
  const store = new TokenStore();
  const book = new PonsBook(store, () => quoteUsd);
  book.launch(parsePonsLog(LOGS.launch, timeOf) as PonsLaunch, 18);
  const events = LOGS.trades.map((l) => parsePonsLog(l, timeOf) as PonsTrade);
  events.forEach((e) => book.trade(e));
  return { token: store.get(TOKEN)!, events };
}

describe("Pons curve trades", () => {
  it("records every real curve trade with its wallet, amounts, price and transaction", () => {
    const { token, events } = ponsWithTrades(3_000);
    const recent = token.pons!.book!.recent;
    expect(recent).toHaveLength(events.length);
    const newest = events.at(-1)!;
    expect(recent[0]).toMatchObject({ tx: newest.tx, side: newest.side, at: newest.at });
    // Buys belong to the recipient: the user even when a router made the call.
    const buy = events.find((e) => e.side === "buy")!;
    expect(recent.find((t) => t.tx === buy.tx && t.side === "buy")?.wallet).toBe(buy.recipient);
    for (const trade of recent) {
      expect(trade.usd).toBeCloseTo(trade.native * 3_000, 9);
      expect(trade.marketCap).toBeGreaterThan(0);
    }
    // The newest trade's market cap is the curve's price after it.
    expect(recent[0].marketCap).toBeCloseTo(ponsSpot(token.pons!) * PONS_SUPPLY * 3_000, 6);
  });

  it("leaves USD blank when the quote asset's price isn't known yet", () => {
    const { token } = ponsWithTrades(null);
    expect(token.pons!.book!.recent.every((t) => t.usd === null && t.marketCap === null)).toBe(true);
  });
});

describe("live trades and top traders on the token page", () => {
  it("shows a Pons token's curve trades with Blockscout links, and their wallets' totals in USD", () => {
    const { token } = ponsWithTrades(3_000);
    const detail = tokenView(token, status, NOW, { activity: { book: token.pons!.book!, isSmart: () => false } });
    expect(detail.trades.length).toBeGreaterThan(0);
    const first = detail.trades[0];
    expect(first.txUrl).toBe(`https://robinhoodchain.blockscout.com/tx/${token.pons!.book!.recent[0].tx}`);
    expect(first.native).toBeCloseTo(token.pons!.book!.recent[0].native, 12);
    // The curve's early buyers are the snipers.
    const early = token.pons!.earlyBuyers ?? [];
    for (const row of detail.trades) expect(row.tag).toBe(early.includes(row.trader) ? "sniper" : null);
    // Only wallets seen buying rank, best realised profit first.
    for (const row of detail.topTraders) expect(row.boughtUsd).toBeGreaterThan(0);
    const pnl = detail.topTraders.map((row) => row.pnlUsd);
    expect(pnl).toEqual([...pnl].sort((a, b) => b - a));
  });

  it("shows a Solana token's Helius trades with Solscan links, ages, smart tags and USD totals", () => {
    const token = priced(40_000, {}, { address: SOL_MINT, supply: 1e15, decimals: 6 });
    const book = newTradeBook();
    const t = (over: Partial<TradeRecord>): TradeRecord => ({ id: "s", tx: "s", at: NOW, side: "buy", wallet: "A", tokens: 100, native: 1, usd: 100, marketCap: 4_000, ...over });
    recordTrades(book, [
      t({ id: "s1", tx: "s1", at: NOW - 90_000, wallet: "Smart1", native: 1, usd: 100 }),
      t({ id: "s2", tx: "s2", at: NOW - 30_000, wallet: "Smart1", side: "sell", tokens: 100, native: 3, usd: null, marketCap: null }),
    ]);
    const detail = tokenView(token, status, NOW, { activity: { book, isSmart: (w) => w === "Smart1" } });
    expect(detail.trades.map((r) => [r.id, r.side, r.ageSeconds, r.tag, r.txUrl])).toEqual([
      ["s2", "sell", 30, "smart", "https://solscan.io/tx/s2"],
      ["s1", "buy", 90, "smart", "https://solscan.io/tx/s1"],
    ]);
    // A sell priced later in SOL takes the book's last known rate ($100 per SOL).
    expect(detail.trades[0].usd).toBeCloseTo(300);
    expect(detail.trades[0].marketCap).toBeNull();
    expect(detail.topTraders).toEqual([{ address: "Smart1", tag: "smart", pnlUsd: 200, boughtUsd: 100, soldUsd: 300, winRate: 1 }]);
    // The book began with the first trade it took in, and the page says so.
    expect(detail.tradersSince).toBe(NOW - 90_000);
  });

  it("lists nothing without a trade book", () => {
    const detail = tokenView(priced(40_000, {}), status, NOW);
    expect(detail.trades).toEqual([]);
    expect(detail.topTraders).toEqual([]);
  });
});
