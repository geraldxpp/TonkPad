import { describe, expect, it } from "vitest";
import { isActivityPage, isChainPortfolio, isMarketSeries } from "../lib/api";
import { csvCell, holdingsCsv } from "../lib/csv";
import { formatDelta, formatPercent, formatQuantity, formatShare, formatValue } from "../lib/format";
import { portfolioSeries } from "../lib/series";
import { type MarketSeries, NO_CHANGE, type PortfolioActivity, type PortfolioAsset } from "../lib/types";
import { parseView, swapHref, totalsOf, unpricedAssets, visibleActivity, visibleAssets } from "../lib/view";

const asset = (patch: Partial<PortfolioAsset>): PortfolioAsset => ({ chain: "sol", address: "mint", symbol: "TOK", name: "Token", art: "", decimals: 6, raw: "1", balance: 1, priceUsd: 1, valueUsd: 1, change: NO_CHANGE, native: false, stable: false, track: null, ...patch });
const chainName = (chain: string) => (chain === "sol" ? "Solana" : "Robinhood Chain");
const view = (query = "") => parseView(new URLSearchParams(query));

const SOL = asset({ address: "sol", symbol: "SOL", name: "Solana", native: true, track: "SOL", valueUsd: 100, priceUsd: 100, balance: 1, change: { ...NO_CHANGE, h24: 10 } });
const USDC = asset({ address: "usdc", symbol: "USDC", name: "USD Coin", stable: true, valueUsd: 50, change: { ...NO_CHANGE, h24: 0 } });
const DUST = asset({ address: "dust", symbol: "DUST", name: "Dust", valueUsd: 2, change: { ...NO_CHANGE, h24: -50 } });
const ETH = asset({ chain: "rh", address: "eth", symbol: "ETH", name: "Ether", native: true, track: "ETH", valueUsd: 200, priceUsd: 2000, balance: 0.1, change: { ...NO_CHANGE, h24: 5 } });
const JUNK = asset({ address: "junk", symbol: "JUNK", name: "Claim at scam.example", priceUsd: null, valueUsd: null });
const ALL = [SOL, USDC, DUST, ETH, JUNK];

describe("the view in the URL", () => {
  it("falls back on defaults for anything it doesn't know", () => {
    expect(view()).toEqual({ chain: "all", range: "1D", tab: "assets", q: "", sort: "value", small: false, type: "all" });
    expect(view("chain=eth&range=5Y&tab=x&sort=y&small=z&type=q")).toEqual(view());
  });

  it("reads a shared view", () => {
    expect(view("chain=sol&range=1W&tab=activity&q=abc&sort=name&small=hide&type=swap")).toEqual({ chain: "sol", range: "1W", tab: "activity", q: "abc", sort: "name", small: true, type: "swap" });
  });
});

describe("the holdings a view shows", () => {
  const symbols = (query: string) => visibleAssets(ALL, view(query), chainName).map((item) => item.symbol);

  it("sorts by value by default, and by change or name when asked", () => {
    expect(symbols("")).toEqual(["ETH", "SOL", "USDC", "DUST"]);
    expect(symbols("sort=change")).toEqual(["SOL", "ETH", "USDC", "DUST"]);
    expect(symbols("sort=name")).toEqual(["DUST", "ETH", "SOL", "USDC"]);
  });

  it("filters by network, by search and by size", () => {
    expect(symbols("chain=rh")).toEqual(["ETH"]);
    expect(symbols("q=usd")).toEqual(["USDC"]);
    expect(symbols("q=robinhood")).toEqual(["ETH"]);
    expect(symbols("small=hide")).toEqual(["ETH", "SOL", "USDC"]);
  });

  it("keeps tokens with no price out of the table and the totals", () => {
    expect(symbols("q=junk")).toEqual([]);
    expect(unpricedAssets(ALL, view()).map((item) => item.symbol)).toEqual(["JUNK"]);
    expect(unpricedAssets(ALL, view("chain=rh"))).toEqual([]);
    expect(totalsOf(ALL)).toEqual({ total: 352, assets: 4, networks: 2, stablecoins: 50 });
  });
});

describe("the activity a view shows", () => {
  const item = (patch: Partial<PortfolioActivity>): PortfolioActivity => ({ id: "tx", chain: "sol", type: "receive", time: 1, failed: false, received: [{ symbol: "USDC", amount: 1 }], sent: [], counterparty: null, url: "u", ...patch });
  const items = [item({ id: "a" }), item({ id: "b", chain: "rh", type: "swap", received: [{ symbol: "GHOST", amount: 1 }], sent: [{ symbol: "ETH", amount: 1 }] })];
  const ids = (query: string) => visibleActivity(items, view(query), chainName).map((entry) => entry.id);

  it("filters by network, type and search", () => {
    expect(ids("")).toEqual(["a", "b"]);
    expect(ids("chain=sol")).toEqual(["a"]);
    expect(ids("type=swap")).toEqual(["b"]);
    expect(ids("q=ghost")).toEqual(["b"]);
  });
});

describe("where a holding trades", () => {
  it("goes into the chain's coin, or into its stablecoin when it is the coin", () => {
    expect(swapHref(asset({ address: "tok" }), "coin", "usd")).toBe("/swap?from=tok&to=coin");
    expect(swapHref(asset({ address: "coin", native: true }), "coin", "usd")).toBe("/swap?from=coin&to=usd");
    expect(swapHref(asset({ chain: "rh", address: "tok" }), "coin", "usd")).toBe("/swap?chain=rh&from=tok&to=coin");
    // Wrapped SOL shares the coin's address: a swap into itself would go nowhere.
    expect(swapHref(asset({ address: "coin", native: false }), "coin", "usd")).toBe("/swap?from=coin&to=usd");
  });
});

describe("the chart", () => {
  const NOW = 1_794_000_000_000;
  const HOUR = 3_600_000;
  const candles = (first: number, last: number): MarketSeries["SOL"] => Array.from({ length: 25 }, (_, i) => [NOW - (24 - i) * HOUR, first + ((last - first) * i) / 24]);
  const market = (patch: Partial<MarketSeries> = {}): MarketSeries => ({ range: "1D", SOL: candles(50, 100), ETH: null, ...patch });

  it("always ends exactly at today's total", () => {
    const { points } = portfolioSeries([SOL, USDC], market(), "1D", NOW);
    expect(points[points.length - 1]).toEqual([NOW, 150]);
  });

  it("traces SOL by its candles, with today's balance", () => {
    const { points, coverage } = portfolioSeries([SOL], market(), "1D", NOW);
    // Half the price a day ago: half the value.
    expect(points[0][1]).toBeCloseTo(50, 5);
    expect(coverage).toBe(1);
  });

  it("holds a stablecoin flat", () => {
    const { points } = portfolioSeries([USDC], market(), "1D", NOW);
    expect(new Set(points.map(([, value]) => value))).toEqual(new Set([50]));
  });

  it("traces other tokens by the market's own moves over the last day", () => {
    const token = asset({ valueUsd: 100, priceUsd: 10, balance: 10, change: { m5: 0, h1: 0, h6: 0, h24: 100 } });
    const { points, coverage } = portfolioSeries([token], market(), "1D", NOW);
    expect(points[0][1]).toBeCloseTo(50, 5);
    expect(points[points.length - 2][1]).toBeCloseTo(100, 5);
    expect(coverage).toBe(1);
  });

  it("doesn't paint a rally for a token it has no history for, and says how much it could cover", () => {
    const token = asset({ valueUsd: 100, priceUsd: 10, balance: 10 });
    const { points, coverage } = portfolioSeries([token, SOL], market({ range: "1W" }), "1W", NOW);
    expect(coverage).toBe(0.5);
    expect(points[0][1]).toBeGreaterThanOrEqual(100);
    // A longer range has no token moves to draw on.
    const year = portfolioSeries([asset({ valueUsd: 100, priceUsd: 10, balance: 10, change: { ...NO_CHANGE, h24: 100 } })], market({ range: "1Y" }), "1Y", NOW);
    expect(year.coverage).toBe(0);
  });

  it("still draws, flat and honest, when no candles could be read", () => {
    const { points, coverage } = portfolioSeries([SOL], null, "1W", NOW);
    expect(points.length).toBeGreaterThan(10);
    expect(coverage).toBe(0);
    expect(points[0][1]).toBeCloseTo(100 / 1.1, 5);
  });

  it("is empty for a wallet worth nothing", () => {
    expect(portfolioSeries([JUNK], market(), "1D", NOW)).toEqual({ points: [], coverage: 0 });
  });
});

describe("the CSV", () => {
  it("quotes text and leaves numbers alone", () => {
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvCell(1.5)).toBe("1.5");
  });

  it("can't be made to run a formula by a token's name", () => {
    for (const name of ['=HYPERLINK("http://evil","x")', "+1+1", "-2", "@SUM(A1)", "\tcmd"]) expect(csvCell(name).startsWith(`"'`)).toBe(true);
  });

  it("writes the holdings on screen", () => {
    const labels = { asset: "Asset", ticker: "Ticker", network: "Network", address: "Address", quantity: "Holdings", price: "Price USD", value: "Value USD", change: "24h" };
    const csv = holdingsCsv([asset({ name: "=evil", symbol: "EVL", address: "mint", balance: 2, priceUsd: 3, valueUsd: 6.006, change: { ...NO_CHANGE, h24: 1.5 } }), SOL], labels, chainName);
    const [header, first, second] = csv.split("\r\n");
    expect(header).toBe('"Asset","Ticker","Network","Address","Holdings","Price USD","Value USD","24h"');
    expect(first).toBe(`"'=evil","EVL","Solana","mint",2,3,6.01,1.5`);
    // A chain's coin has no contract to list.
    expect(second).toBe('"Solana","SOL","Solana","",1,100,100,10');
  });
});

describe("figures", () => {
  it("keep their sign, and specks stay visible", () => {
    expect([formatDelta(89.93), formatDelta(-12.4), formatPercent(2.4), formatPercent(-0.31)]).toEqual(["+$89.93", "−$12.40", "+2.40%", "−0.31%"]);
    expect([formatQuantity(0.42), formatQuantity(1250), formatQuantity(0.0000001), formatQuantity(1234.56789)]).toEqual(["0.42", "1,250", "<0.000001", "1,234.57"]);
    expect([formatValue(0.001), formatValue(0), formatValue(12.5)]).toEqual(["<$0.01", "$0.00", "$12.50"]);
    expect([formatShare(70.1, 100), formatShare(1, 0)]).toEqual(["70.1%", "0.0%"]);
  });
});

describe("responses from the server", () => {
  const owner = "86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY";

  it("are checked against the wallet and chain that asked", () => {
    const good = { chain: "sol", owner, assets: [], unpriced: 0, partial: false, readAt: 1 };
    expect(isChainPortfolio(good, "sol", owner)).toBe(true);
    expect(isChainPortfolio(good, "rh", owner)).toBe(false);
    expect(isChainPortfolio({ ...good, owner: "someone-else" }, "sol", owner)).toBe(false);
    expect(isChainPortfolio(null, "sol", owner)).toBe(false);
    expect(isActivityPage({ chain: "sol", owner, items: [], next: null }, "sol", owner)).toBe(true);
    expect(isActivityPage({ chain: "sol", owner, items: [], next: 5 }, "sol", owner)).toBe(false);
    expect(isMarketSeries({ range: "1D", SOL: [], ETH: null }, "1D")).toBe(true);
    expect(isMarketSeries({ range: "1W", SOL: [], ETH: null }, "1D")).toBe(false);
  });
});
