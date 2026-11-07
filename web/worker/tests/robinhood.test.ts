// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NOT_ON_DEXSCREENER } from "../src/model";
import { PonsBook } from "../src/pons/book";
import { parseSnapshot } from "../src/snapshot";
import { type DexPair, pickMainPair } from "../src/sources/dexscreener";
import { parsePonsLog, type PonsLaunch, type PonsTrade } from "../src/sources/pons";
import { bestQuotePrice } from "../src/sources/prices";
import { TokenStore } from "../src/store";
import { buysLast15m } from "../src/tokens";
import { overviewView } from "../src/views/overview";
import { HOUR, MIN, NOW, priced } from "./fixtures";
import { LAUNCH_TIME, LOGS, timeOf, TOKEN } from "./pons-fixtures";

const SPY = "0x117cc2133c37b721f49de2a7a74833232b3b4c0c";

function ponsToken() {
  const store = new TokenStore();
  const book = new PonsBook(store);
  book.launch(parsePonsLog(LOGS.launch, timeOf) as PonsLaunch, 18);
  LOGS.trades.forEach((l) => book.trade(parsePonsLog(l, timeOf) as PonsTrade));
  return { store, book, token: store.get(TOKEN)! };
}

describe("DexScreener for graduated Pons tokens", () => {
  const graduate: DexPair = {
    dexId: "uniswap",
    baseToken: { address: "0x8231fdc77207Ede2455259e2d391Eb4f026581f4" },
    quoteToken: { address: "0x0000000000000000000000000000000000000000" },
    pairCreatedAt: NOW,
    volume: { h24: 10 },
  };

  it("matches the Uniswap v4 pool whatever the address's letter case", () => {
    expect(pickMainPair([graduate], "0x8231fdc77207ede2455259e2d391eb4f026581f4", "pons", NOW - HOUR)).toEqual({ pair: graduate, onCurve: false });
  });

  it("trusts a stock quote only for the launch paired with it", () => {
    const spyPool = { ...graduate, quoteToken: { address: "0x117cC2133c37B721f49dE2A7a74833232B3B4c0C" } };
    expect(pickMainPair([spyPool], graduate.baseToken!.address!, "pons", NOW - HOUR)).toBeNull();
    expect(pickMainPair([spyPool], graduate.baseToken!.address!, "pons", NOW - HOUR, SPY)).toEqual({ pair: spyPool, onCurve: false });
  });

  it("keeps Solana addresses case-sensitive", () => {
    const sol = "So11111111111111111111111111111111111111112";
    const pump: DexPair = { dexId: "pumpfun", baseToken: { address: "MintAbc" }, quoteToken: { address: sol }, pairCreatedAt: NOW };
    expect(pickMainPair([pump], "mintabc", "pump", NOW)).toBeNull();
    expect(pickMainPair([pump], "MintAbc", "pump", NOW)).toEqual({ pair: pump, onCurve: true });
  });
});

describe("quote-asset prices", () => {
  it("takes the most liquid pair's price", () => {
    const pairs = [
      { baseToken: { address: "0x117cC2133c37B721f49dE2A7a74833232B3B4c0C" }, priceUsd: "736.10", liquidity: { usd: 4_000 } },
      { baseToken: { address: SPY }, priceUsd: "737.33", liquidity: { usd: 190_000 } },
      { baseToken: { address: "0xother" }, priceUsd: "1", liquidity: { usd: 9e9 } },
    ];
    expect(bestQuotePrice(pairs, SPY)).toBe(737.33);
    expect(bestQuotePrice(pairs, "0xmissing")).toBeNull();
    expect(bestQuotePrice([{ baseToken: { address: SPY }, priceUsd: "n/a" }], SPY)).toBeNull();
  });
});

describe("snapshots", () => {
  it("reads both the old token list and the new format with the Pons cursor", () => {
    expect(parseSnapshot("[]")).toEqual({ tokens: [], ponsBlock: null });
    expect(parseSnapshot('{"tokens":[],"ponsBlock":107857724}')).toEqual({ tokens: [], ponsBlock: 107_857_724, smart: null });
    expect(parseSnapshot('{"ponsBlock":"x"}')).toEqual({ tokens: [], ponsBlock: null, smart: null });
  });

  it("keeps smart money's graduates and wallet credits", () => {
    const smart = { graduates: { T: { chain: "sol", creator: "C", at: 1 } }, credits: { W: ["T"] } };
    expect(parseSnapshot(JSON.stringify({ tokens: [], ponsBlock: 1, smart })).smart).toEqual(smart);
  });

  it("restores Pons curves without sending them to DexScreener", () => {
    const { token } = ponsToken();
    const graduated = {
      ...token,
      address: "0xgrad",
      pons: { ...token.pons!, curve: "0xgradcurve" },
      graduated: true,
      graduatedAt: NOW - HOUR,
      createdAt: NOW - 2 * HOUR,
    };
    const store = new TokenStore();
    store.restore([{ ...token, createdAt: NOW - HOUR }, graduated], NOW);
    expect(store.get(TOKEN)?.nextRefreshAt).toBe(NOT_ON_DEXSCREENER);
    expect(store.dueForRefresh("rh", NOW, 30).map((r) => r.address)).toEqual(["0xgrad"]);
    const book = new PonsBook(store);
    expect(book.trade({ ...(parsePonsLog(LOGS.trades[1], timeOf) as PonsTrade) })).toBe(true);
  });
});

describe("views with Robinhood Chain", () => {
  it("counts Pons buys exactly and names Pons first on the radar", () => {
    const { token, book } = ponsToken();
    const now = LAUNCH_TIME * 1000 + 10 * MIN;
    book.refresh(now, () => 2_000);
    expect(buysLast15m(token, now)).toBe(14);
    const view = overviewView([token, priced(9_000, { h24: { volume: 1 } })], ["pons", "pump", "bonk"], now);
    expect(view.scope).toEqual({ pads: ["Pons", "Pump.fun", "Bonk.fun"], more: 0 });
    expect(view.chainCounts).toMatchObject({ rh: 1 });
    expect(view.launchpads.find((c) => c.id === "pons")?.count).toBe(1);
  });
});
