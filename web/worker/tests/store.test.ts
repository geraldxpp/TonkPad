// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ISSUERS } from "../src/issuers";
import type { LaunchEvent } from "../src/model";
import type { MarketData } from "../src/sources/dexscreener";
import type { AssetInfo } from "../src/sources/helius";
import { pushSample, TokenStore } from "../src/store";
import { address, HOUR, MIN, NOW, SEC, tracked, windows } from "./fixtures";

const CDN = "https://cdn.helius-rpc.com/cdn-cgi/image/width=256,quality=80,format=auto/";
const CID = "QmbpT6T3zfMoJCZKwPB9ZwuifgQYryTrHR7K13ihyEpPsx";

function launch(label: string, over: Partial<LaunchEvent> = {}): LaunchEvent {
  return {
    address: address(label),
    chain: "sol",
    launchpad: "pump",
    name: label,
    symbol: label.toUpperCase(),
    creator: address("Dev"),
    createdAt: NOW,
    creatorBuyShare: 0,
    marketCapNative: 30,
    ...over,
  };
}

function market(over: Partial<MarketData> = {}): MarketData {
  return {
    priceUsd: 0.00001, priceNative: 1e-7, marketCap: 10_000, liquidityUsd: 9_000, dexId: "pumpfun",
    pool: address("Curve"), curvePool: address("Curve"), onCurve: true, windows: windows({ h24: { buys: 12 } }), ...over,
  };
}

const asset = (over: Partial<AssetInfo> = {}): AssetInfo => ({
  image: null,
  name: null,
  symbol: null,
  mintRevoked: true,
  freezeRevoked: true,
  mintAuthority: null,
  freezeAuthority: null,
  supply: null,
  ...over,
});

function storeWith(...events: LaunchEvent[]): TokenStore {
  const store = new TokenStore();
  for (const event of events) store.addLaunch(event, 90);
  return store;
}

describe("TokenStore market data", () => {
  it("adds each launch once, priced from its market cap at launch", () => {
    const store = storeWith(launch("a"));
    expect(store.addLaunch(launch("a"), 90)).toBe(false);
    expect(store.get(address("a"))).toMatchObject({
      marketCap: 2_700,
      marketAt: 0,
      nextRefreshAt: NOW + 5 * SEC,
      image: `${CDN}https://images.pump.fun/coin-image/${address("a")}`,
    });
  });

  it("drops a launch DexScreener proves fake", () => {
    const store = storeWith(launch("a"));
    store.applyMarket(address("a"), "invalid", NOW);
    expect(store.size).toBe(0);
  });

  it("tracks curve progress, history and the next refresh while on the curve", () => {
    const store = storeWith(launch("a"));
    const halfway = 72.5 ** 2 / (30 * 1_073_000_000);
    store.applyMarket(address("a"), market({ priceNative: halfway }), NOW + 10 * SEC);
    const token = store.get(address("a"));
    expect(token?.curve).toBeCloseTo(0.5, 6);
    expect(token).toMatchObject({ graduated: false, marketAt: NOW + 10 * SEC, nextRefreshAt: NOW + 18 * SEC });
    // Within a minute of the launch point, the history keeps one point with the latest value.
    expect(token?.mcapSeries).toEqual([[NOW, 10_000]]);
    expect(token?.buySamples).toEqual([[NOW + 10 * SEC, 12]]);
  });

  it("marks a token graduated once it trades off its curve", () => {
    const store = storeWith(launch("a"));
    store.applyMarket(address("a"), market({ onCurve: false, dexId: "pumpswap" }), NOW + MIN);
    expect(store.get(address("a"))).toMatchObject({ graduated: true, graduatedAt: NOW + MIN, curve: 1, dexId: "pumpswap", liquidityUsd: 9_000 });
  });

  it("keeps the curve pair for the chart after the token moves to its pool", () => {
    const store = storeWith(launch("a"));
    store.applyMarket(address("a"), market(), NOW + 10 * SEC);
    expect(store.get(address("a"))).toMatchObject({ pool: address("Curve"), curvePool: address("Curve") });
    store.applyMarket(address("a"), market({ onCurve: false, dexId: "pumpswap", pool: address("Amm"), curvePool: null }), NOW + MIN);
    expect(store.get(address("a"))).toMatchObject({ graduated: true, pool: address("Amm"), curvePool: address("Curve") });
  });

  it("leaves a token waiting when DexScreener has nothing yet", () => {
    const store = storeWith(launch("a"));
    store.applyMarket(address("a"), undefined, NOW + 5 * SEC);
    expect(store.get(address("a"))).toMatchObject({ marketAt: 0, nextRefreshAt: NOW + 13 * SEC });
    expect(store.dueForRefresh("sol", NOW + 13 * SEC, 30)).toEqual([{ address: address("a"), launchpad: "pump", launchedAt: NOW }]);
  });
});

describe("TokenStore art and safety facts", () => {
  it("looks art up 15 s after launch, then every minute while it's missing, for 30 minutes", () => {
    const store = storeWith(launch("b", { launchpad: "bonk" }));
    const due = (at: number) => store.needingAssets("sol", new Set(), 10, at);
    expect(due(NOW + 5 * SEC)).toEqual([]);
    expect(due(NOW + 20 * SEC)).toEqual([address("b")]);
    store.applyAsset(address("b"), asset(), NOW + 20 * SEC);
    expect(due(NOW + 50 * SEC)).toEqual([]);
    expect(due(NOW + 90 * SEC)).toEqual([address("b")]);
    expect(due(NOW + 31 * MIN)).toEqual([]);
  });

  it("looks up visible tokens first, then the newest", () => {
    const store = storeWith(launch("old", { createdAt: NOW - 5 * MIN }), launch("new", { createdAt: NOW - MIN }));
    expect(store.needingAssets("sol", new Set(), 10, NOW)).toEqual([address("new"), address("old")]);
    expect(store.needingAssets("sol", new Set([address("old")]), 10, NOW)).toEqual([address("old"), address("new")]);
  });

  it("fills in art, safety facts and a missing name and ticker", () => {
    const store = storeWith(launch("c", { name: "", symbol: "", launchpad: "bonk" }));
    store.applyAsset(address("c"), asset({ image: `https://ipfs.io/ipfs/${CID}`, name: "Torch", symbol: "$TORCH", freezeRevoked: false }), NOW);
    expect(store.get(address("c"))).toMatchObject({
      name: "Torch",
      symbol: "TORCH",
      mintRevoked: true,
      freezeRevoked: false,
      image: `${CDN}https://ipfs.filebase.io/ipfs/${CID}`,
    });
  });

  it("records the supply and an issuer claim, and forgets Jupiter's word when the claim changes", () => {
    const { mintAuthority, freezeAuthority } = ISSUERS.ondo;
    const store = storeWith(launch("e"));
    store.applyAsset(address("e"), asset({ mintAuthority, freezeAuthority, supply: 1e15 }), NOW);
    const token = store.get(address("e"));
    expect(token).toMatchObject({ issuerClaim: "ondo", issuer: null, issuerCheckedAt: 0, supply: 1e15 });
    if (token) token.issuer = "ondo";
    store.applyAsset(address("e"), asset({ mintAuthority, freezeAuthority }), NOW);
    expect(token).toMatchObject({ issuer: "ondo", supply: 1e15 });
    store.applyAsset(address("e"), asset({ mintAuthority: "Someone else", freezeAuthority }), NOW);
    expect(token).toMatchObject({ issuerClaim: null, issuer: null });
  });

  it("keeps Pump.fun's own art for its tokens, whatever the metadata says", () => {
    const store = storeWith(launch("d"));
    const pumpArt = `${CDN}https://images.pump.fun/coin-image/${address("d")}`;
    store.applyAsset(address("d"), asset({ image: `https://ipfs.io/ipfs/${CID}` }), NOW);
    expect(store.get(address("d"))?.image).toBe(pumpArt);
    store.applyAsset(address("d"), asset(), NOW);
    expect(store.get(address("d"))?.image).toBe(pumpArt);
  });
});

describe("TokenStore snapshots", () => {
  it("keeps a day of launches plus the day's graduates", () => {
    const old = tracked({}, 25 * HOUR);
    const oldGraduate = tracked({ graduated: true, graduatedAt: NOW - 2 * HOUR }, 25 * HOUR);
    const fresh = tracked({}, HOUR);
    const store = new TokenStore();
    store.restore([old, oldGraduate, fresh], NOW);
    expect(store.all().map((t) => t.address).sort()).toEqual([oldGraduate.address, fresh.address].sort());
  });

  it("re-points old art and refreshes restored tokens at once", () => {
    const saved = tracked({ image: `${CDN}https://ipfs.io/ipfs/${CID}`, nextRefreshAt: NOW + HOUR });
    const store = new TokenStore();
    store.restore([saved], NOW);
    expect(store.get(saved.address)).toMatchObject({ image: `${CDN}https://pump.mypinata.cloud/ipfs/${CID}`, nextRefreshAt: NOW });
  });
});

describe("pushSample", () => {
  it("keeps one point per interval, updated to the latest value", () => {
    const series: Array<[number, number]> = [[0, 1]];
    pushSample(series, [30, 2], 60, 10);
    pushSample(series, [70, 3], 60, 10);
    expect(series).toEqual([
      [0, 2],
      [70, 3],
    ]);
  });

  it("thins the older half once past the cap", () => {
    const series: Array<[number, number]> = [];
    for (let i = 0; i < 7; i++) pushSample(series, [i * 60, i], 60, 6);
    expect(series.map(([, v]) => v)).toEqual([0, 2, 3, 4, 5, 6]);
  });
});
