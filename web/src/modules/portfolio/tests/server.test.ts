// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as activityRoute } from "@/app/api/portfolio/[chain]/[owner]/activity/route";
import { GET as holdingsRoute } from "@/app/api/portfolio/[chain]/[owner]/route";
import { GET as marketRoute } from "@/app/api/portfolio/market/route";
import { clearCache } from "@/shared/swap/server/cache";
import { NATIVE_EVM, SOL_MINT, USDC_MINT, USDG, WETH } from "@/shared/swap/tokens";
import type { RpcCall } from "@/shared/wallet/rpc";
import { activityType, solanaActivity } from "../server/activity";
import { cutBlock, parseTransfer, robinhoodActivity, type RobinhoodTransfer } from "../server/activity-rh";
import { cleanName, cleanSymbol, toAmount } from "../server/clean";
import { bestPrice, clearDexPrices } from "../server/dex";
import { clearSolanaTokens, parseJupiterToken, type SolanaTokenInfo } from "../server/jupiter";
import { parseCandles } from "../server/market";
import { clearRobinhoodTokens, parseTokenBalances, readRobinhoodPortfolio } from "../server/robinhood";
import { readSolanaPortfolio, sumTokenAccounts, trimUnpriced } from "../server/solana";

const SOL_OWNER = "86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY";
const RH_OWNER = "0x55df7b52c913112aa45de61a6f6980fd00daed46";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const JUNK = "Junk111111111111111111111111111111111111111";
const GHOST = "0xfeb4e36fa4a2a494ff25ae4a63491e4c584a67ae";

const account = (mint: string, amount: string, decimals: number) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals } } } } } });
const jupiterToken = (id: string, usdPrice: number, patch: Record<string, unknown> = {}) => ({ id, name: `${id.slice(0, 3)} name`, symbol: id.slice(0, 3), icon: "https://example.com/art.png", usdPrice, liquidity: 50_000, stats5m: { priceChange: 0.1 }, stats1h: { priceChange: 1 }, stats6h: { priceChange: 2 }, stats24h: { priceChange: -5 }, ...patch });
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  clearCache();
  clearSolanaTokens();
  clearDexPrices();
  clearRobinhoodTokens();
  vi.stubEnv("JUPITER_API_KEY", "test-key");
  vi.stubEnv("NEXT_PUBLIC_TONK_NETWORK", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("text and amounts from a chain", () => {
  it("cleans a token's name and ticker, and falls back on its address", () => {
    expect(cleanName("\u0007 Real Name ", BONK)).toBe("Real Name");
    expect(cleanName("x".repeat(100), BONK)).toHaveLength(40);
    expect(cleanName("", BONK)).toBe("DezX…B263");
    expect(cleanSymbol("LONGTICKERNAMEHERE", BONK)).toHaveLength(12);
    expect(cleanSymbol(undefined, "0xabcdef0000000000000000000000000000000000")).toBe("ABCDE");
  });

  it("turns base units into a number without losing small amounts", () => {
    expect(toAmount(BigInt("1500000000"), 9)).toBe(1.5);
    expect(toAmount(BigInt(5), 0)).toBe(5);
    expect(toAmount(BigInt("24800471698113207547169812"), 18)).toBeCloseTo(24800471.698, 2);
  });
});

describe("a Solana wallet's tokens", () => {
  it("adds accounts up per mint, and leaves out NFTs and empty accounts", () => {
    const held = sumTokenAccounts({ value: [account(BONK, "100", 5), account(BONK, "50", 5), account("nft", "1", 0), account("empty", "0", 6), { bad: true }] });
    expect([...held.keys()]).toEqual([BONK]);
    expect(held.get(BONK)).toEqual({ raw: BigInt(150), decimals: 5 });
  });

  it("prices only tokens with a real market behind them", () => {
    expect(parseJupiterToken(jupiterToken(BONK, 2))?.priceUsd).toBe(2);
    expect(parseJupiterToken(jupiterToken(BONK, 2))?.change).toEqual({ m5: 0.1, h1: 1, h6: 2, h24: -5 });
    expect(parseJupiterToken(jupiterToken(BONK, 2, { liquidity: 999 }))?.priceUsd).toBeNull();
    expect(parseJupiterToken(jupiterToken(BONK, 2, { audit: { isSus: true } }))?.priceUsd).toBeNull();
    expect(parseJupiterToken(jupiterToken(BONK, 2, { audit: { isSus: true }, isVerified: true }))?.priceUsd).toBe(2);
    expect(parseJupiterToken({ id: BONK, name: "No market" })?.priceUsd).toBeNull();
    expect(parseJupiterToken("nope")).toBeNull();
  });

  const rpc = (patch: Partial<Record<string, unknown>> = {}): RpcCall =>
    vi.fn(async (method: string, params: readonly unknown[]) => {
      if (method === "getBalance") return "getBalance" in patch ? patch.getBalance : { value: 2_000_000_000 };
      const program = (params[1] as { programId: string }).programId;
      if (program.startsWith("Tokenz")) {
        if (patch.token2022Fails) throw new Error("down");
        return { value: [] };
      }
      return { value: [account(BONK, "1000000", 5), account(USDC_MINT, "5000000", 6), account(JUNK, "42000000", 6)] };
    });

  it("reads SOL and every token, with name, art, price and value", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond([jupiterToken(SOL_MINT, 100), jupiterToken(BONK, 2), jupiterToken(USDC_MINT, 1)])));
    const portfolio = await readSolanaPortfolio(SOL_OWNER, rpc());
    expect(portfolio).toMatchObject({ chain: "sol", owner: SOL_OWNER, unpriced: 1, partial: false });
    const bySymbol = Object.fromEntries(portfolio.assets.map((asset) => [asset.symbol, asset]));
    expect(bySymbol.SOL).toMatchObject({ native: true, track: "SOL", balance: 2, priceUsd: 100, valueUsd: 200, name: "Solana", art: "/chains/sol.png" });
    expect(bySymbol.Dez).toMatchObject({ native: false, stable: false, balance: 10, valueUsd: 20, track: null });
    expect(bySymbol.Dez.art).toContain("cdn.helius-rpc.com");
    expect(bySymbol.EPj).toMatchObject({ stable: true, art: "/coins/usdc.svg", valueUsd: 5 });
    expect(portfolio.assets.find((asset) => asset.address === JUNK)).toMatchObject({ priceUsd: null, valueUsd: null, stable: false });
  });

  it("marks an answer partial when a token program or the prices can't be read, and keeps the rest", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond([jupiterToken(SOL_MINT, 100)])));
    expect(await readSolanaPortfolio(SOL_OWNER, rpc({ token2022Fails: true }))).toMatchObject({ partial: true });
    clearSolanaTokens();
    vi.stubGlobal("fetch", vi.fn(async () => respond({}, 500)));
    const noPrices = await readSolanaPortfolio(SOL_OWNER, rpc());
    expect(noPrices.partial).toBe(true);
    expect(noPrices.assets.every((asset) => asset.priceUsd === null)).toBe(true);
  });

  it("fails only when the wallet's own SOL can't be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond([])));
    await expect(readSolanaPortfolio(SOL_OWNER, rpc({ getBalance: { value: "nope" } }))).rejects.toThrow("getBalance");
  });

  it("asks Jupiter once about a token with no market, however often the wallet refreshes", async () => {
    const fetchMock = vi.fn(async () => respond([jupiterToken(SOL_MINT, 100)]));
    vi.stubGlobal("fetch", fetchMock);
    await readSolanaPortfolio(SOL_OWNER, rpc());
    const asked = (call: number) => new URL(String((fetchMock.mock.calls[call] as unknown[])[0])).searchParams.get("query") ?? "";
    expect(asked(0)).toContain(JUNK);
    await readSolanaPortfolio(SOL_OWNER, rpc());
    // Nothing has gone stale yet, so nothing is asked again.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends every priced asset and a page of the rest, and counts them all", () => {
    const asset = (priceUsd: number | null) => ({ priceUsd }) as never;
    const { assets, unpriced } = trimUnpriced([asset(1), ...Array.from({ length: 150 }, () => asset(null))]);
    expect([assets.length, unpriced]).toEqual([101, 150]);
  });
});

describe("a price from DexScreener", () => {
  const pair = (patch: Record<string, unknown> = {}) => ({ baseToken: { address: GHOST }, quoteToken: { address: USDG }, priceUsd: "0.5", liquidity: { usd: 20_000 }, priceChange: { m5: 1, h1: 2, h6: 3, h24: 4 }, ...patch });

  it("takes the deepest pool for that token, with its moves", () => {
    const price = bestPrice([pair({ priceUsd: "0.1", liquidity: { usd: 5_000 } }), pair()], GHOST);
    expect(price).toEqual({ priceUsd: 0.5, change: { m5: 1, h1: 2, h6: 3, h24: 4 }, art: "" });
  });

  it("ignores pools where the token is only the quote, and pools too shallow to trust", () => {
    expect(bestPrice([pair({ baseToken: { address: "0x1" } })], GHOST)).toBeNull();
    expect(bestPrice([pair({ liquidity: { usd: 999 } })], GHOST)).toBeNull();
    // Against an unknown coin the bar is higher: a fake quote can fake its own liquidity.
    expect(bestPrice([pair({ quoteToken: { address: "0xfake" }, liquidity: { usd: 9_000 } })], GHOST)).toBeNull();
    expect(bestPrice([pair({ quoteToken: { address: "0xfake" }, liquidity: { usd: 10_000 } })], GHOST)?.priceUsd).toBe(0.5);
  });

  it("uses art only from DexScreener's own CDN", () => {
    expect(bestPrice([pair({ info: { imageUrl: "https://cdn.dexscreener.com/x.png" } })], GHOST)?.art).toBe("https://cdn.dexscreener.com/x.png");
    expect(bestPrice([pair({ info: { imageUrl: "https://evil.example/x.png" } })], GHOST)?.art).toBe("");
  });
});

describe("a Robinhood Chain wallet's tokens", () => {
  const word = (value: bigint) => `0x${value.toString(16)}`;
  const dex = () =>
    vi.fn(async () =>
      respond([
        { baseToken: { address: WETH }, quoteToken: { address: USDG }, priceUsd: "2000", liquidity: { usd: 1_000_000 }, priceChange: { h24: -2 } },
        { baseToken: { address: GHOST }, quoteToken: { address: USDG }, priceUsd: "0.5", liquidity: { usd: 20_000 }, priceChange: { h24: 10 }, info: { imageUrl: "https://cdn.dexscreener.com/g.png" } },
      ]),
    );
  const FAKE_USDG = "0x1111111111111111111111111111111111111111";

  it("keeps only non-zero balances", () => {
    expect([...parseTokenBalances({ tokenBalances: [{ contractAddress: GHOST, tokenBalance: "0x10" }, { contractAddress: USDG, tokenBalance: "0x0" }], pageKey: "next" }).balances]).toEqual([[GHOST, BigInt(16)]]);
    expect(parseTokenBalances({ tokenBalances: [] }).pageKey).toBeNull();
  });

  const rpc: RpcCall = vi.fn(async (method: string, params: readonly unknown[]) => {
    if (method === "eth_getBalance") return word(BigInt(10) ** BigInt(18));
    if (method === "alchemy_getTokenBalances") return { tokenBalances: [{ contractAddress: USDG, tokenBalance: word(BigInt(3_000_000)) }, { contractAddress: GHOST, tokenBalance: word(BigInt(10) ** BigInt(19)) }, { contractAddress: FAKE_USDG, tokenBalance: word(BigInt(1_000_000)) }] };
    if (method === "alchemy_getTokenMetadata") return params[0] === GHOST ? { name: "Ghost", symbol: "GHOST", decimals: 18, logo: null } : { name: "Global Dollar", symbol: "USDG", decimals: 6, logo: null };
    throw new Error(`unexpected ${method}`);
  });

  it("reads ETH and every ERC-20, priced from the deepest pools", async () => {
    vi.stubGlobal("fetch", dex());
    const portfolio = await readRobinhoodPortfolio(RH_OWNER, rpc);
    const byAddress = Object.fromEntries(portfolio.assets.map((asset) => [asset.address, asset]));
    expect(byAddress[NATIVE_EVM]).toMatchObject({ native: true, symbol: "ETH", track: "ETH", balance: 1, priceUsd: 2000, valueUsd: 2000 });
    expect(byAddress[GHOST]).toMatchObject({ balance: 10, valueUsd: 5, art: "https://cdn.dexscreener.com/g.png", stable: false });
    // USDG holds its dollar with no pool of its own.
    expect(byAddress[USDG.toLowerCase()]).toMatchObject({ stable: true, priceUsd: 1, valueUsd: 3, art: "/coins/usdg.svg" });
    // A token that only calls itself USDG is neither stable nor priced.
    expect(byAddress[FAKE_USDG]).toMatchObject({ symbol: "USDG", stable: false, priceUsd: null });
    expect(portfolio).toMatchObject({ partial: false, unpriced: 1 });
  });

  it("falls back to the base tokens, and says so, on an RPC with no token index", async () => {
    vi.stubGlobal("fetch", dex());
    const plain: RpcCall = vi.fn(async (method: string, params: readonly unknown[]) => {
      if (method === "eth_getBalance") return word(BigInt(0));
      if (method === "eth_call") return (params[0] as { to: string }).to === USDG ? word(BigInt(2_000_000)) : "0x0";
      throw new Error("method not found");
    });
    const portfolio = await readRobinhoodPortfolio(RH_OWNER, plain);
    expect(portfolio.partial).toBe(true);
    expect(portfolio.assets.map((asset) => [asset.symbol, asset.valueUsd])).toEqual([["USDG", 2]]);
  });
});

describe("activity on Solana", () => {
  const tokens = new Map<string, SolanaTokenInfo>([[BONK, { symbol: "BONK", name: "Bonk", art: "", priceUsd: 1, change: { m5: null, h1: null, h6: null, h24: null } }]]);
  const change = (mint: string, amount: string, decimals = 5) => ({ userAccount: SOL_OWNER, mint, rawTokenAmount: { tokenAmount: amount, decimals } });
  const tx = (data: Record<string, unknown>[], patch: Record<string, unknown> = {}) => ({ signature: "sig", timestamp: 1_794_000_000, feePayer: SOL_OWNER, fee: 5000, transactionError: null, accountData: data, ...patch });
  const own = (nativeBalanceChange: number, tokenBalanceChanges: unknown[] = []) => ({ account: SOL_OWNER, nativeBalanceChange, tokenBalanceChanges });

  it("reads a swap from what the wallet gained and lost", () => {
    const item = solanaActivity(tx([own(-500_005_000, [change(BONK, "1000000")])]), SOL_OWNER, tokens);
    expect(item).toMatchObject({ type: "swap", received: [{ symbol: "BONK", amount: 10 }], sent: [{ symbol: "SOL", amount: 0.5 }], failed: false, time: 1_794_000_000_000, counterparty: null });
    expect(item?.url).toBe("https://solscan.io/tx/sig");
  });

  it("doesn't mistake rent and fees for part of a trade", () => {
    expect(solanaActivity(tx([own(-2_044_280, [change(BONK, "1000000")])], { feePayer: "someone-else" }), SOL_OWNER, tokens)).toMatchObject({ type: "receive", sent: [] });
  });

  it("names who a send went to and a receive came from", () => {
    const sent = solanaActivity(tx([own(-1_000_005_000)], { nativeTransfers: [{ fromUserAccount: SOL_OWNER, toUserAccount: "friend", amount: 1 }] }), SOL_OWNER, tokens);
    expect(sent).toMatchObject({ type: "send", counterparty: "friend", sent: [{ symbol: "SOL", amount: 1 }] });
    const received = solanaActivity(tx([own(2_000_000_000)], { feePayer: "friend", nativeTransfers: [{ fromUserAccount: "friend", toUserAccount: SOL_OWNER, amount: 2 }] }), SOL_OWNER, tokens);
    expect(received).toMatchObject({ type: "receive", counterparty: "friend" });
  });

  it("leaves out spam airdrops, specks of SOL and anything that moved nothing of the wallet's", () => {
    expect(solanaActivity(tx([own(0, [change(JUNK, "100")])], { feePayer: "spammer" }), SOL_OWNER, tokens)).toBeNull();
    expect(solanaActivity(tx([own(1)], { feePayer: "spammer" }), SOL_OWNER, tokens)).toBeNull();
    expect(solanaActivity(tx([{ account: "other", nativeBalanceChange: 9, tokenBalanceChanges: [] }], { feePayer: "other" }), SOL_OWNER, tokens)).toBeNull();
    expect(solanaActivity("nope", SOL_OWNER, tokens)).toBeNull();
  });

  it("shows a failed transaction only when the wallet paid for it", () => {
    expect(solanaActivity(tx([own(-5000)], { transactionError: { error: "x" } }), SOL_OWNER, tokens)).toMatchObject({ failed: true });
    expect(solanaActivity(tx([], { transactionError: { error: "x" }, feePayer: "other" }), SOL_OWNER, tokens)).toBeNull();
  });

  it("names a type from its legs", () => {
    expect([activityType([1], [1]), activityType([1], []), activityType([], [1]), activityType([], [])]).toEqual(["swap", "receive", "send", null]);
  });
});

describe("activity on Robinhood Chain", () => {
  const me = RH_OWNER;
  const transfer = (patch: Partial<RobinhoodTransfer>): RobinhoodTransfer => ({ hash: "0xabc", block: 100, time: 1000, from: "0xother", to: me, symbol: "GHOST", amount: 5, contract: GHOST, ...patch });
  const known = new Set([GHOST]);

  it("parses a transfer, and refuses a malformed one", () => {
    const parsed = parseTransfer({ hash: "0xabc", blockNum: "0x10", from: "0xAA", to: "0xBB", value: 1.5, asset: "GHOST", rawContract: { address: "0xCC" }, metadata: { blockTimestamp: "2026-11-11T04:10:40.000Z" } });
    expect(parsed).toEqual({ hash: "0xabc", block: 16, time: Date.parse("2026-11-11T04:10:40.000Z"), from: "0xaa", to: "0xbb", symbol: "GHOST", amount: 1.5, contract: "0xcc" });
    expect(parseTransfer({ hash: "0xabc" })).toBeNull();
    expect(parseTransfer({ hash: "0xabc", blockNum: "0x10", from: "a", to: "b", value: 0, metadata: { blockTimestamp: "2026-11-11T04:10:40.000Z" } })).toBeNull();
  });

  it("nets a transaction's transfers into a swap, a receive or a send", () => {
    expect(robinhoodActivity([transfer({}), transfer({ from: me, to: "0xrouter", symbol: "ETH", amount: 0.1, contract: null })], me, known)).toMatchObject({ type: "swap", received: [{ symbol: "GHOST", amount: 5 }], sent: [{ symbol: "ETH", amount: 0.1 }], counterparty: null });
    expect(robinhoodActivity([transfer({})], me, known)).toMatchObject({ type: "receive", counterparty: "0xother" });
    expect(robinhoodActivity([transfer({ from: me, to: "0xfriend" })], me, known)).toMatchObject({ type: "send", counterparty: "0xfriend" });
  });

  it("leaves out airdrops of tokens with no market, and transfers that net to nothing", () => {
    expect(robinhoodActivity([transfer({ contract: "0xjunk" })], me, known)).toBeNull();
    expect(robinhoodActivity([transfer({}), transfer({ from: me, to: "0xback" })], me, known)).toBeNull();
    expect(robinhoodActivity([], me, known)).toBeNull();
  });

  it("cuts a page at the deeper of the two streams' ends, so nothing is skipped", () => {
    const list = (...blocks: number[]) => blocks.map((block) => transfer({ block }));
    expect(cutBlock({ list: list(100, 90), full: true }, { list: list(100, 50), full: true })).toBe(90);
    expect(cutBlock({ list: list(100, 90), full: false }, { list: list(100, 50), full: true })).toBe(50);
    expect(cutBlock({ list: list(100), full: false }, { list: [], full: false })).toBeNull();
  });
});

describe("market candles", () => {
  it("takes the closes, oldest first", () => {
    expect(parseCandles([[200, 1, 2, 1, 5, 9], [100, 1, 2, 1, 4, 9], "bad", [300, 1, 2, 1, 0, 9]])).toEqual([[100_000, 4], [200_000, 5]]);
    expect(() => parseCandles({ message: "rate limited" })).toThrow();
  });
});

describe("the portfolio routes", () => {
  const req = (url: string) => new Request(`http://x${url}`);
  const context = <T extends object>(params: T) => ({ params: Promise.resolve(params) }) as never;

  it("accept only an address in the chain's own format", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("must not be called"); }));
    const bad = await Promise.all([
      holdingsRoute(req("/api/portfolio/sol/nope"), context({ chain: "sol", owner: "nope" })),
      holdingsRoute(req(`/api/portfolio/rh/${SOL_OWNER}`), context({ chain: "rh", owner: SOL_OWNER })),
      holdingsRoute(req(`/api/portfolio/eth/${RH_OWNER}`), context({ chain: "eth", owner: RH_OWNER })),
      activityRoute(req("/api/portfolio/sol/nope/activity"), context({ chain: "sol", owner: "nope" })),
      activityRoute(req(`/api/portfolio/sol/${SOL_OWNER}/activity?cursor=x;y`), context({ chain: "sol", owner: SOL_OWNER })),
    ]);
    for (const response of bad) {
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("refuse an unknown chart range", async () => {
    expect((await marketRoute(req("/api/portfolio/market?range=5Y"))).status).toBe(400);
  });

  it("are closed on the testnet site, whose tokens have no market", async () => {
    vi.stubEnv("NEXT_PUBLIC_TONK_NETWORK", "testnet");
    const responses = await Promise.all([holdingsRoute(req(`/api/portfolio/sol/${SOL_OWNER}`), context({ chain: "sol", owner: SOL_OWNER })), activityRoute(req(`/api/portfolio/sol/${SOL_OWNER}/activity`), context({ chain: "sol", owner: SOL_OWNER })), marketRoute(req("/api/portfolio/market?range=1D"))]);
    for (const response of responses) expect([response.status, await response.json()]).toEqual([404, { error: "closed" }]);
  });

  it("answer unavailable, uncached and without detail, when the chains can't be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("secret-url-with-key"); }));
    const response = await holdingsRoute(req(`/api/portfolio/sol/${SOL_OWNER}`), context({ chain: "sol", owner: SOL_OWNER }));
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});
