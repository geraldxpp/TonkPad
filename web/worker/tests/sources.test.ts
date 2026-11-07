// @vitest-environment node
import { describe, expect, it } from "vitest";
import { curveProgressFromPrice, curveProgressFromReserve } from "../src/curve";
import { type DexPair, pickMainPair, toMarketData } from "../src/sources/dexscreener";
import { toAssetInfo } from "../src/sources/helius";
import { isLaunch, parsePumpPortal } from "../src/sources/pumpportal";
import { HOUR, MIN, NOW } from "./fixtures";

describe("parsePumpPortal", () => {
  const create = { txType: "create", mint: "MintA", pool: "pump", name: "  Ghosty  ", symbol: "$GHOST", traderPublicKey: "Dev", initialBuy: 50_000_000, marketCapSol: 31.5 };

  it("turns a Pump.fun create into a launch", () => {
    const event = parsePumpPortal(create, NOW);
    expect(event).toEqual({
      address: "MintA",
      chain: "sol",
      launchpad: "pump",
      name: "Ghosty",
      symbol: "GHOST",
      creator: "Dev",
      createdAt: NOW,
      creatorBuyShare: 0.05,
      marketCapNative: 31.5,
    });
    expect(event && isLaunch(event)).toBe(true);
  });

  it("accepts Bonk.fun and ignores other pools", () => {
    expect(parsePumpPortal({ ...create, pool: "bonk" }, NOW)).toMatchObject({ launchpad: "bonk" });
    expect(parsePumpPortal({ ...create, pool: "moonit" }, NOW)).toBeNull();
  });

  it("caps long names and symbols and clamps the creator's share", () => {
    const event = parsePumpPortal({ ...create, name: "x".repeat(80), symbol: "Y".repeat(30), initialBuy: 5e9 }, NOW);
    expect(event).toMatchObject({ name: "x".repeat(48), symbol: "Y".repeat(16), creatorBuyShare: 1 });
  });

  it("reads graduations and drops anything else", () => {
    expect(parsePumpPortal({ txType: "migrate", mint: "MintA", pool: "pump-amm" }, NOW)).toEqual({ address: "MintA", at: NOW });
    expect(parsePumpPortal({ txType: "buy", mint: "MintA" }, NOW)).toBeNull();
    expect(parsePumpPortal({ message: "Successfully subscribed" }, NOW)).toBeNull();
    expect(parsePumpPortal("not json", NOW)).toBeNull();
  });
});

describe("bonding curve", () => {
  const K = 30 * 1_073_000_000;
  const priceAt = (virtualSol: number) => (virtualSol * virtualSol) / K;

  it("runs from 0 at launch to 1 once 85 SOL is raised", () => {
    expect(curveProgressFromPrice(priceAt(30))).toBeCloseTo(0, 6);
    expect(curveProgressFromPrice(priceAt(72.5))).toBeCloseTo(0.5, 6);
    expect(curveProgressFromPrice(priceAt(115))).toBeCloseTo(1, 6);
    expect(curveProgressFromPrice(priceAt(200))).toBe(1);
  });

  it("treats a missing price as the start", () => {
    expect(curveProgressFromPrice(0)).toBe(0);
    expect(curveProgressFromPrice(Number.NaN)).toBe(0);
    expect(curveProgressFromReserve(57.2)).toBeCloseTo(0.32, 6);
  });
});

describe("pickMainPair", () => {
  const SOL = "So11111111111111111111111111111111111111112";
  const pair = (dexId: string, createdAt: number, extra: Partial<DexPair> = {}): DexPair => ({
    dexId,
    baseToken: { address: "MintA" },
    quoteToken: { address: SOL },
    pairCreatedAt: createdAt,
    volume: { h24: 1_000 },
    ...extra,
  });
  const launchedAt = NOW - HOUR;

  it("prefers the graduation pool over the bonding curve", () => {
    const grad = pair("pumpswap", NOW - 5 * MIN);
    const picked = pickMainPair([pair("pumpfun", launchedAt), grad], "MintA", "pump", launchedAt);
    expect(picked).toEqual({ pair: grad, onCurve: false });
  });

  it("falls back to the curve, and ignores pools against junk coins", () => {
    const curve = pair("pumpfun", launchedAt);
    const junk = pair("meteora", launchedAt, { quoteToken: { address: "Junk" }, volume: { h24: 9e9 } });
    expect(pickMainPair([junk, curve], "MintA", "pump", launchedAt)).toEqual({ pair: curve, onCurve: true });
  });

  it("flags a launch whose pools predate it as fake", () => {
    expect(pickMainPair([pair("raydium", NOW - 30 * 24 * HOUR)], "MintA", "pump", launchedAt)).toBe("invalid");
  });

  it("returns null while there is nothing to trust yet", () => {
    expect(pickMainPair([], "MintA", "pump", launchedAt)).toBeNull();
    expect(pickMainPair([pair("pumpfun", launchedAt, { baseToken: { address: "Other" } })], "MintA", "pump", launchedAt)).toBeNull();
  });

  it("reads numbers that arrive as strings", () => {
    const data = toMarketData(
      pair("pumpfun", launchedAt, {
        priceUsd: "0.0000123",
        priceNative: "1.4e-7",
        marketCap: 12_300,
        priceChange: { m5: 4.2, h24: 120 },
        liquidity: { usd: 25_000 },
        txns: { h1: { buys: 40, sells: 12 } },
      }),
      true,
    );
    expect(data).toMatchObject({ priceUsd: 0.0000123, priceNative: 1.4e-7, marketCap: 12_300, liquidityUsd: 25_000, dexId: "pumpfun", onCurve: true });
    expect(toMarketData({ dexId: "pumpfun" }, true).liquidityUsd).toBeNull();
    expect(data.windows.m5.change).toBe(4.2);
    expect(data.windows.h1).toEqual({ change: 0, volume: 0, buys: 40, sells: 12 });
  });
});

describe("toAssetInfo", () => {
  it("reads art, names and whether the authorities were given up", () => {
    const info = toAssetInfo({
      content: { metadata: { name: " Torch ", symbol: "TORCH" }, links: { image: "https://ipfs.io/ipfs/QmArt" } },
      token_info: { mint_authority: null, freeze_authority: "Someone", supply: 999_990_000_000_000 },
    });
    expect(info).toEqual({
      image: "https://ipfs.io/ipfs/QmArt",
      name: "Torch",
      symbol: "TORCH",
      mintRevoked: true,
      freezeRevoked: false,
      mintAuthority: null,
      freezeAuthority: "Someone",
      supply: 999_990_000_000_000,
    });
  });

  it("falls back to the first file and copes with missing metadata", () => {
    expect(toAssetInfo({ content: { files: [{ uri: "https://x.test/a.png" }] } }).image).toBe("https://x.test/a.png");
    expect(toAssetInfo({})).toEqual({
      image: null,
      name: null,
      symbol: null,
      mintRevoked: null,
      freezeRevoked: null,
      mintAuthority: null,
      freezeAuthority: null,
      supply: null,
    });
  });
});
