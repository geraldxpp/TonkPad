// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NOT_ON_DEXSCREENER } from "../src/model";
import { PonsBook } from "../src/pons/book";
import { newPonsState, PONS_SUPPLY, ponsProgress, ponsSpot, ponsWindows, trimTrades } from "../src/pons/curve";
import { PonsFeed } from "../src/pons/feed";
import { decodeAbiString, NATIVE_ETH, parsePonsLog, PONS_TOPICS, type PonsLaunch, type PonsTrade, SELECTORS } from "../src/sources/pons";
import { TokenStore } from "../src/store";
import { HOUR, MIN } from "./fixtures";
import { keccak256 } from "./keccak";
import { abiString, blockOf, buyAt, CURVE, FakeRpc, LAUNCH_TIME, LOGS, timeOf, TOKEN } from "./pons-fixtures";

const launchEvent = () => parsePonsLog(LOGS.launch, timeOf) as PonsLaunch;
const tradeEvents = () => LOGS.trades.map((l) => parsePonsLog(l, timeOf) as PonsTrade);

function launched() {
  const store = new TokenStore();
  const book = new PonsBook(store);
  book.launch(launchEvent(), 18);
  return { store, book, token: store.get(TOKEN)! };
}

describe("Pons logs", () => {
  it("hard-codes topics and selectors that match their signatures", () => {
    expect(keccak256("")).toBe("0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    expect(PONS_TOPICS).toEqual({
      launched: keccak256("TokenLaunched(address,address,address,address,uint256,uint256)"),
      graduated: keccak256("PoolGraduated(address,uint256,uint256,uint256)"),
      buy: keccak256("CurveBuy(address,address,uint256,uint256,uint256,uint256)"),
      sell: keccak256("CurveSell(address,address,uint256,uint256,uint256,uint256)"),
      completed: keccak256("CurveCompleted(address,uint256,uint256)"),
    });
    for (const [name, selector] of Object.entries(SELECTORS)) expect(keccak256(`${name}()`).slice(0, 10)).toBe(selector);
  });

  it("reads a real launch, timed from its block", () => {
    expect(launchEvent()).toEqual({
      kind: "launch",
      token: TOKEN,
      curve: CURVE,
      creator: "0x0b69f754bc02a80cf334c1976e8b50bf7eb8a790",
      quote: NATIVE_ETH,
      configId: BigInt(0),
      threshold: BigInt("4200000000000000000"),
      at: LAUNCH_TIME * 1000,
      tx: LOGS.launch.transactionHash,
    });
  });

  it("reads buys and sells", () => {
    const trades = tradeEvents();
    expect(trades[0]).toMatchObject({ kind: "trade", curve: CURVE, side: "buy", tx: LOGS.launch.transactionHash });
    expect(Number(trades[0].quoteAmount) / 1e18).toBeCloseTo(0.25, 12);
    const sell = trades.find((t) => t.side === "sell")!;
    // The sell dumps exactly what the third buy bought.
    expect(sell.tokenAmount).toBe(trades[2].tokenAmount);
    expect(sell.at).toBe(timeOf(blockOf(LOGS.trades[trades.indexOf(sell)])));
  });

  it("ignores launches not from the factory, unknown events and short data", () => {
    expect(parsePonsLog({ ...LOGS.launch, address: "0x" + "1".repeat(40) }, timeOf)).toBeNull();
    expect(parsePonsLog({ ...LOGS.trades[0], topics: ["0x" + "ab".repeat(32)] }, timeOf)).toBeNull();
    expect(parsePonsLog({ ...LOGS.trades[0], data: "0x" + "00".repeat(64) }, timeOf)).toBeNull();
  });

  it("decodes Solidity strings", () => {
    expect(decodeAbiString(abiString("ipfs://bafkrei"))).toBe("ipfs://bafkrei");
    expect(decodeAbiString(abiString("Squirrel In Vest"))).toBe("Squirrel In Vest");
    expect(decodeAbiString("0x")).toBeNull();
    expect(decodeAbiString(null)).toBeNull();
  });
});

describe("Pons curve", () => {
  it("replays real trades with the product of the reserves held constant", () => {
    const { book, token } = launched();
    const pons = token.pons!;
    const k = pons.virtualQuote * pons.virtualTokens;
    for (const trade of tradeEvents()) {
      expect(book.trade(trade)).toBe(true);
      expect((pons.virtualQuote * pons.virtualTokens) / k).toBeCloseTo(1, 9);
    }
    expect(ponsProgress(pons)).toBeCloseTo((pons.virtualQuote - 1.68) / 4.2, 12);
    expect(ponsProgress(pons)).toBeGreaterThan(0.1);
    // The creator's buy came in the launch transaction: 128.4M of 1B tokens.
    expect(token.creatorBuyShare).toBeCloseTo(0.1284, 4);
  });

  it("prices the token, its windows and its curve progress in USD", () => {
    const { book, token } = launched();
    tradeEvents().forEach((t) => book.trade(t));
    const now = timeOf(blockOf(LOGS.trades.at(-1)!)) + MIN;
    book.refresh(now, () => 2_000);
    const spot = ponsSpot(token.pons!);
    expect(token.marketCap).toBeCloseTo(spot * PONS_SUPPLY * 2_000, 6);
    expect(token.priceUsd).toBeCloseTo(spot * 2_000, 12);
    expect(token).toMatchObject({ marketAt: now, curve: ponsProgress(token.pons!) });
    const quotes = tradeEvents().reduce((sum, t) => sum + Number(t.quoteAmount) / 1e18, 0);
    expect(token.windows.h24).toMatchObject({ buys: 14, sells: 1 });
    expect(token.windows.h24.volume).toBeCloseTo(quotes * 2_000, 6);
    expect(token.windows.h24.change).toBeCloseTo((spot / (1.68 / PONS_SUPPLY) - 1) * 100, 6);
  });

  it("waits for the quote asset's price before pricing a token", () => {
    const { book, token } = launched();
    book.refresh(LAUNCH_TIME * 1000, () => null);
    expect(token.marketAt).toBe(0);
  });

  it("keeps a day of trades plus the one that sets the 24h start price", () => {
    const now = LAUNCH_TIME * 1000;
    const s = newPonsState({ curve: CURVE, quote: NATIVE_ETH, quoteDecimals: 18, threshold: 4.2, launchTx: "0x1" });
    s.trades.push([now - 30 * HOUR, 1, 1, 1], [now - 25 * HOUR, 1, 1, 2], [now - 2 * HOUR, 0, 1, 3]);
    trimTrades(s, now);
    expect(s.trades.map(([, , , price]) => price)).toEqual([2, 3]);
    const w = ponsWindows(s, 1, now);
    expect([w.h24.buys, w.h24.sells, w.h1.buys + w.h1.sells]).toEqual([0, 1, 0]);
  });
});

describe("Pons book", () => {
  it("ignores trades from contracts that aren't known curves", () => {
    const { book } = launched();
    expect(book.trade({ ...tradeEvents()[1], curve: "0x" + "9".repeat(40) })).toBe(false);
  });

  it("graduates by curve or by token and hands the token to DexScreener", () => {
    const { book, store, token } = launched();
    expect(token.nextRefreshAt).toBe(NOT_ON_DEXSCREENER);
    book.graduate({ kind: "graduation", token: null, curve: CURVE, at: 123 });
    expect(token).toMatchObject({ graduated: true, graduatedAt: 123, curve: 1, nextRefreshAt: 123 });
    expect(book.trade(tradeEvents()[1])).toBe(false);
    expect(store.dueForRefresh("rh", 200, 30)).toEqual([{ address: TOKEN, launchpad: "pons", launchedAt: LAUNCH_TIME * 1000, quote: NATIVE_ETH }]);

    const other = launched();
    other.book.graduate({ kind: "graduation", token: TOKEN, curve: null, at: 456 });
    expect(other.token.graduatedAt).toBe(456);
  });
});

describe("PonsFeed", () => {
  const lastBlock = blockOf(LOGS.trades.at(-1)!);

  it("rebuilds the last day on a fresh start, with names, tickers and logos", async () => {
    const rpc = new FakeRpc(lastBlock + 100, [LOGS.launch, ...LOGS.trades]);
    const store = new TokenStore();
    const feed = new PonsFeed(rpc, new PonsBook(store));
    expect(await feed.poll()).toEqual({ launches: 1, trades: 15 });
    expect(feed.cursor).toBe(lastBlock + 100);
    expect(rpc.ranges[0][0]).toBe(lastBlock + 100 - 864_000 + 1);
    expect(store.get(TOKEN)).toMatchObject({
      name: "Mock Token",
      symbol: "MOCK",
      chain: "rh",
      launchpad: "pons",
      createdAt: LAUNCH_TIME * 1000,
      image: expect.stringContaining("ipfs.filebase.io/ipfs/bafkreifennbm"),
    });
  });

  it("then reads only new blocks", async () => {
    const rpc = new FakeRpc(lastBlock + 100, [LOGS.launch, ...LOGS.trades]);
    const feed = new PonsFeed(rpc, new PonsBook(new TokenStore()));
    await feed.poll();
    rpc.logList.push(buyAt(lastBlock + 140));
    rpc.head = lastBlock + 150;
    rpc.ranges.length = 0;
    expect(await feed.poll()).toEqual({ launches: 0, trades: 1 });
    expect(rpc.ranges).toEqual([[lastBlock + 101, lastBlock + 150]]);
  });

  it("starts over after a gap of more than a day", async () => {
    const rpc = new FakeRpc(lastBlock + 100, [LOGS.launch, ...LOGS.trades]);
    const store = new TokenStore();
    const feed = new PonsFeed(rpc, new PonsBook(store));
    await feed.poll();
    feed.cursor = lastBlock + 100 - 900_000;
    expect(await feed.poll()).toEqual({ launches: 1, trades: 15 });
    expect(store.size).toBe(1);
  });

  it("learns an unfamiliar quote asset's decimals before taking its launches", async () => {
    const spy = "117cc2133c37b721f49de2a7a74833232b3b4c0c";
    const data = "0x" + spy.padStart(64, "0") + "0".repeat(64) + BigInt("10900000000000000000").toString(16).padStart(64, "0");
    const rpc = new FakeRpc(blockOf(LOGS.launch) + 10, [{ ...LOGS.launch, data }]);
    const store = new TokenStore();
    await new PonsFeed(rpc, new PonsBook(store)).poll();
    expect(store.get(TOKEN)?.pons).toMatchObject({ quote: "0x" + spy, quoteDecimals: 18, threshold: 10.9 });
  });
});
