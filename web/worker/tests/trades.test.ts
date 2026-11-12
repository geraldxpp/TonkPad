// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMintTrades, type HeliusTransaction, pageCredits, parseTrade } from "../src/sources/helius-trades";
import { TokenStore } from "../src/store";
import { MAX_WALLETS, newTradeBook, RECENT_TRADES, recordTrades, topTraders, type TradeRecord } from "../src/trades/book";
import { createSolanaTrades } from "../src/trades/solana";
import { NOW, priced } from "./fixtures";

const MINT = "Mint1111111111111111111111111111111111111111";
const WALLET = "Wa11et1111111111111111111111111111111111111";
const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const balance = (mint: string, amount: number, decimals = 6) => ({ mint, owner: WALLET, uiTokenAmount: { amount: String(amount * 10 ** decimals), decimals } });

/** A transaction where WALLET's SOL went from `solBefore` to `solAfter` (fee 5,000 lamports) and its token balances from `pre` to `post`. */
function tx(solBefore: number, solAfter: number, pre: ReturnType<typeof balance>[], post: ReturnType<typeof balance>[], extra: Partial<HeliusTransaction> = {}): HeliusTransaction {
  return {
    slot: 100,
    blockTime: NOW / 1000,
    transaction: { signatures: ["sig1"], message: { accountKeys: [WALLET, MINT] } },
    meta: { err: null, fee: 5_000, preBalances: [solBefore * 1e9, 0], postBalances: [solAfter * 1e9 - 5_000, 0], preTokenBalances: pre, postTokenBalances: post },
    ...extra,
  };
}

describe("parseTrade", () => {
  it("reads a buy from the SOL spent and tokens gained, leaving out the new token account's rent", () => {
    const trade = parseTrade(tx(2, 1 - 0.00203928, [], [balance(MINT, 1_000_000)]), MINT, 200);
    expect(trade).toMatchObject({ id: "sig1", tx: "sig1", side: "buy", wallet: WALLET, tokens: 1_000_000, at: NOW });
    expect(trade?.native).toBeCloseTo(1);
    expect(trade?.usd).toBeCloseTo(200);
  });

  it("reads a sell from tokens given and SOL received, leaving out the closed account's refund", () => {
    const trade = parseTrade(tx(1, 1.5 + 0.00203928, [balance(MINT, 400_000)], []), MINT, 200);
    expect(trade).toMatchObject({ side: "sell", tokens: 400_000 });
    expect(trade?.native).toBeCloseTo(0.5);
  });

  it("counts wrapped SOL and dollar stablecoins as what was paid", () => {
    const wrapped = parseTrade(tx(1, 1, [balance(MINT, 0), balance(WSOL, 3, 9)], [balance(MINT, 10), balance(WSOL, 1, 9)]), MINT, 100);
    expect(wrapped?.native).toBeCloseTo(2);
    const dollars = parseTrade(tx(1, 1, [balance(MINT, 0), balance(USDC, 500)], [balance(MINT, 10), balance(USDC, 250)]), MINT, 100);
    expect(dollars?.usd).toBeCloseTo(250);
    expect(dollars?.native).toBeCloseTo(2.5);
  });

  it("skips transfers, failed transactions and other wallets' trades", () => {
    // Tokens arrived but nothing was paid: a transfer or airdrop.
    expect(parseTrade(tx(1, 1, [balance(MINT, 0)], [balance(MINT, 10)]), MINT, 100)).toBeNull();
    expect(parseTrade(tx(2, 1, [], [balance(MINT, 10)], { meta: { err: { custom: 1 } } }), MINT, 100)).toBeNull();
    expect(parseTrade(tx(2, 1, [balance("OtherMint", 0)], [balance("OtherMint", 10)]), MINT, 100)).toBeNull();
    expect(parseTrade(tx(2, 1, [], [balance(MINT, 10)], { blockTime: null }), MINT, 100)).toBeNull();
  });

  it("prices in USD only when SOL's price is known", () => {
    expect(parseTrade(tx(2, 1, [], [balance(MINT, 10)]), MINT, null)?.usd).toBeNull();
  });
});

describe("fetchMintTrades", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for successful transactions from the last slot on, newest first, and charges per 100", async () => {
    const bodies: Array<{ method: string; params: [string, Record<string, unknown>] }> = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: "trades", result: { data: [{ ...tx(2, 1, [], [balance(MINT, 10)]), slot: 120 }], paginationToken: null } }));
    });
    const page = await fetchMintTrades("key", MINT, 110, 100, 100);
    expect(bodies[0].method).toBe("getTransactionsForAddress");
    expect(bodies[0].params[0]).toBe(MINT);
    expect(bodies[0].params[1]).toMatchObject({ transactionDetails: "full", sortOrder: "desc", limit: 100, filters: { status: "succeeded", slot: { gte: 110 } } });
    expect(page).toMatchObject({ slot: 120, credits: 10 });
    expect(page.trades).toHaveLength(1);
    expect([pageCredits(0), pageCredits(100), pageCredits(101), pageCredits(300)]).toEqual([10, 10, 20, 30]);
  });
});

const trade = (over: Partial<TradeRecord>): TradeRecord => ({ id: "t", tx: "t", at: NOW, side: "buy", wallet: "A", tokens: 100, native: 1, usd: 100, marketCap: null, ...over });

describe("trade book", () => {
  it("keeps each trade once, newest first, and at most the latest hundred", () => {
    const book = newTradeBook();
    expect(recordTrades(book, [trade({ id: "a", at: NOW - 2 }), trade({ id: "b", at: NOW - 1 })])).toBe(2);
    expect(recordTrades(book, [trade({ id: "b", at: NOW - 1 }), trade({ id: "c", at: NOW })])).toBe(1);
    expect(book.recent.map((t) => t.id)).toEqual(["c", "b", "a"]);
    recordTrades(book, Array.from({ length: 150 }, (_, i) => trade({ id: `x${i}`, at: NOW + i })));
    expect(book.recent).toHaveLength(RECENT_TRADES);
    expect(book.recent[0].id).toBe("x149");
  });

  it("ranks top traders by what they took out, with the share of sells that beat their average buy", () => {
    const book = newTradeBook();
    recordTrades(book, [
      trade({ id: "1", wallet: "A", side: "buy", tokens: 100, native: 1, at: NOW - 5 }),
      trade({ id: "2", wallet: "A", side: "sell", tokens: 50, native: 2, at: NOW - 4 }), // 0.04 per token against 0.01 bought: a win
      trade({ id: "3", wallet: "A", side: "sell", tokens: 50, native: 0.25, at: NOW - 3 }), // 0.005: a loss
      trade({ id: "4", wallet: "B", side: "buy", tokens: 10, native: 1, at: NOW - 2 }),
      trade({ id: "5", wallet: "B", side: "sell", tokens: 10, native: 1.5, at: NOW - 1 }),
      trade({ id: "6", wallet: "C", side: "buy", tokens: 10, native: 5, at: NOW }), // hasn't sold: not a top trader yet
    ]);
    expect(topTraders(book)).toEqual([
      { wallet: "A", bought: 1, sold: 2.25, realised: 1.25, winRate: 0.5 },
      { wallet: "B", bought: 1, sold: 1.5, realised: 0.5, winRate: 1 },
    ]);
    expect(book.since).toBe(NOW - 5);
  });

  it("ranks by realised profit on what the book saw bought and sold, never a sell with no buy on record", () => {
    const book = newTradeBook();
    recordTrades(book, [
      // Bought before the book began: a big sell, but no cost on record, so no rank.
      trade({ id: "1", wallet: "Early", side: "sell", tokens: 1_000, native: 50, at: NOW - 9 }),
      // Holds most of what it bought: its profit is on the tokens it sold, not its cash out.
      trade({ id: "2", wallet: "Holder", side: "buy", tokens: 100, native: 10, at: NOW - 8 }),
      trade({ id: "3", wallet: "Holder", side: "sell", tokens: 10, native: 3, at: NOW - 7 }),
      // Sold more than the book saw it buy: only the 10 tokens it was seen buying count.
      trade({ id: "4", wallet: "Partial", side: "buy", tokens: 10, native: 1, at: NOW - 6 }),
      trade({ id: "5", wallet: "Partial", side: "sell", tokens: 40, native: 8, at: NOW - 5 }),
    ]);
    const rows = topTraders(book);
    expect(rows.map((r) => r.wallet)).toEqual(["Holder", "Partial"]);
    expect(rows[0].realised).toBeCloseTo(3 - 1, 9);
    expect(rows[1].realised).toBeCloseTo(8 * (10 / 40) - 1, 9);
  });

  it("keeps the same order between refreshes when profits tie", () => {
    const book = newTradeBook();
    recordTrades(book, ["Z", "M", "A"].flatMap((wallet, i) => [
      trade({ id: `${wallet}b`, wallet, side: "buy", tokens: 10, native: 1, at: NOW - 10 + i }),
      trade({ id: `${wallet}s`, wallet, side: "sell", tokens: 10, native: 2, at: NOW - 5 + i }),
    ]));
    expect(topTraders(book).map((r) => r.wallet)).toEqual(["A", "M", "Z"]);
  });

  it("drops the least active wallets past its limit", () => {
    const book = newTradeBook();
    recordTrades(book, Array.from({ length: MAX_WALLETS + 5 }, (_, i) => trade({ id: `w${i}`, wallet: `W${i}`, native: i + 1 })));
    expect(Object.keys(book.flows)).toHaveLength(MAX_WALLETS);
    expect(book.flows.W0).toBeUndefined();
  });
});

describe("Solana trade feeds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function setup(dailyCredits: number, opened: string[]) {
    const store = new TokenStore();
    const token = priced(50_000, {}, { address: MINT, supply: 1e15, decimals: 6 });
    store.add(token);
    const limits: number[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const { params } = JSON.parse(init.body) as { params: [string, { limit: number }] };
      limits.push(params[1].limit);
      // 1 SOL for 1,000 tokens, plus the new token account's rent.
      return new Response(JSON.stringify({ result: { data: [tx(2, 1 - 0.00203928, [], [balance(MINT, 1_000)])], paginationToken: null } }));
    });
    let credits = 0;
    const feeds = createSolanaTrades({
      store, apiKey: "key", opened: () => new Set(opened), solUsd: () => 100, dailyCredits,
      onCredits: (c) => (credits += c), fail: () => {},
    });
    return { feeds, limits, credits: () => credits };
  }

  it("fetches only open tokens: the last 300 transactions first, then newer ones every 30 seconds", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { feeds, limits, credits } = setup(1_000, [MINT]);
    await feeds.refresh();
    await feeds.refresh();
    expect(limits).toEqual([300]);
    vi.setSystemTime(NOW + 30_000);
    await feeds.refresh();
    expect(limits).toEqual([300, 100]);
    expect(credits()).toBe(20);
    const book = feeds.bookOf(MINT);
    expect(book?.recent).toHaveLength(1);
    // Price per token times supply (1B whole tokens): $100 for 1,000 tokens.
    expect(book?.recent[0].marketCap).toBeCloseTo(100_000_000);
  });

  it("spends nothing on tokens nobody has open, or past the day's cap", async () => {
    const closed = setup(1_000, []);
    await closed.feeds.refresh();
    expect(closed.limits).toEqual([]);
    const capped = setup(25, [MINT]);
    await capped.feeds.refresh();
    expect(capped.limits).toEqual([]);
    expect(capped.feeds.usage()).toMatchObject({ creditsToday: 0, dailyCredits: 25 });
  });
});
