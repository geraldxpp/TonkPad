// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { holderCountsDue, holdersDue, issuerChecksDue } from "../src/safety";
import { base58Decode, base58Encode, isOnCurve, isWalletAddress } from "../src/solana";
import { fetchTopHolders, topHolderShare } from "../src/sources/holders";
import { holderCounts } from "../src/sources/jupiter";
import { HOUR, MIN, NOW, priced, tracked } from "./fixtures";
import fixture from "./fixtures/holders.json";
import { associatedTokenAddress } from "./pda";

const { mint, tokenProgram, supply, accounts } = fixture.largest;
const balances = accounts.map((a) => ({ owner: a.owner, amount: Number(a.amount) }));

describe("Solana keys", () => {
  it("round-trips base58, leading zero bytes included", () => {
    const bytes = Uint8Array.from([0, 0, 7, 255, 1]);
    expect(base58Decode(base58Encode(bytes))).toEqual(bytes);
    expect(base58Decode(mint)?.length).toBe(32);
    expect(base58Decode("not base58: 0OIl")).toBeNull();
  });

  it("treats wallets that signed launches as wallets", () => {
    for (const wallet of fixture.wallets) expect(isWalletAddress(wallet)).toBe(true);
  });

  it("treats program-derived addresses (pools, token accounts) as not wallets", () => {
    for (const owner of fixture.programOwners) expect(isWalletAddress(owner)).toBe(false);
    for (const { account } of fixture.tokenAccounts) expect(isWalletAddress(account)).toBe(false);
    expect(isWalletAddress("short")).toBe(false);
  });

  it("derives the same token accounts as the chain, so every on-curve answer along the way was right", () => {
    for (const { account, owner } of fixture.tokenAccounts) {
      expect(associatedTokenAddress(owner, mint, tokenProgram)).toBe(account);
    }
  });

  it("knows the all-zero key is a curve point", () => {
    expect(isOnCurve(new Uint8Array(32))).toBe(true);
    expect(isOnCurve(new Uint8Array(31))).toBe(false);
  });
});

describe("topHolderShare", () => {
  it("sums the 10 largest wallets and leaves out pools, burns and program accounts", () => {
    // USDF-style spread: one wallet with 2.45%, then wallets with exactly 0.20% each.
    expect(topHolderShare(balances, supply)).toBeCloseTo(0.04244, 4);
  });

  it("counts one wallet's accounts together and caps at the whole supply", () => {
    const [wallet] = fixture.wallets;
    expect(topHolderShare([{ owner: wallet, amount: 30 }, { owner: wallet, amount: 30 }], 100)).toBeCloseTo(0.6);
    expect(topHolderShare([{ owner: wallet, amount: 300 }], 100)).toBe(1);
    expect(topHolderShare([{ owner: "1nc1nerator11111111111111111111111111111111", amount: 90 }], 100)).toBe(0);
  });

  it("can't tell without a supply", () => {
    expect(topHolderShare(balances, 0)).toBeNull();
  });
});

describe("fetchTopHolders", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubHelius(decimals?: number) {
    const methods: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const { method } = JSON.parse(init.body) as { method: string };
      methods.push(method);
      const result =
        method === "getTokenLargestAccounts"
          ? { value: fixture.tokenAccounts.map((t) => ({ address: t.account, amount: "1000", decimals })) }
          : method === "getTokenSupply"
            ? { value: { amount: "10000" } }
            : { value: fixture.tokenAccounts.map((t) => ({ data: { parsed: { info: { owner: t.owner } } } })) };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: method, result }));
    });
    return methods;
  }

  it("reads the largest accounts and their owners: 2 credits, 3 without a known supply", async () => {
    const methods = stubHelius();
    let calls = 0;
    const known = await fetchTopHolders("key", mint, 10_000, () => calls++);
    expect(methods).toEqual(["getTokenLargestAccounts", "getMultipleAccounts"]);
    expect(calls).toBe(2);
    // Five wallets of 1,000 each out of 10,000; the sixth account belongs to a pool.
    expect(known).toMatchObject({ share: 0.5, supply: 10_000 });
    expect(known.wallets).toEqual(fixture.tokenAccounts.map((t) => t.owner).filter((owner) => isWalletAddress(owner)));
    expect(known.wallets).toHaveLength(5);
    const unknown = await fetchTopHolders("key", mint, null, () => calls++);
    expect(calls).toBe(5);
    expect(unknown.supply).toBe(10_000);
  });

  it("keeps the decimals the largest accounts report, so older tokens can list holders", async () => {
    stubHelius(6);
    expect((await fetchTopHolders("key", mint, 10_000, () => {})).decimals).toBe(6);
    stubHelius();
    expect((await fetchTopHolders("key", mint, 10_000, () => {})).decimals).toBeNull();
  });

  it("reports an RPC error instead of a share", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "boom" } })));
    await expect(fetchTopHolders("key", mint, 1, () => {})).rejects.toThrow("getTokenLargestAccounts: boom");
  });
});

describe("holdersDue", () => {
  it("picks Solana tokens on screen worth $5K+: never measured first, then the stalest", () => {
    const fresh = priced(30_000, {});
    const stale = priced(90_000, {}, { holdersAt: NOW - 40 * MIN });
    const recent = priced(25_000, {}, { holdersAt: NOW - 5 * MIN });
    const small = priced(4_000, {});
    const robinhood = priced(50_000, {}, { chain: "rh" });
    const stock = priced(60_000, {}, { issuer: "xstocks" });
    const offScreen = priced(70_000, {});
    const all = [stale, recent, small, robinhood, stock, offScreen, fresh];
    const visible = new Set(all.filter((t) => t !== offScreen).map((t) => t.address));
    expect(holdersDue(all, visible, 3, NOW)).toEqual([fresh, stale]);
    expect(holdersDue(all, visible, 1, NOW)).toEqual([fresh]);
  });

  it("measures a token someone has open whatever its size, ahead of the rest", () => {
    const listed = priced(90_000, {});
    const small = priced(4_000, {});
    const stock = priced(60_000, {}, { issuer: "xstocks" });
    const all = [listed, small, stock];
    const visible = new Set(all.map((t) => t.address));
    const opened = new Set([small.address, stock.address]);
    // Both open tokens come first (the bigger of the two first), then the listed one.
    expect(holdersDue(all, visible, 3, NOW, opened)).toEqual([stock, small, listed]);
    expect(holdersDue(all, visible, 1, NOW, opened)).toEqual([stock]);
  });

  it("checks an open token again soon when it was measured before decimals were kept", () => {
    const old = priced(20_000, {}, { holdersAt: NOW - 3 * MIN, decimals: null });
    const known = priced(20_000, {}, { holdersAt: NOW - 3 * MIN, decimals: 6 });
    const justNow = priced(20_000, {}, { holdersAt: NOW - MIN, decimals: null });
    const all = [old, known, justNow];
    const visible = new Set(all.map((t) => t.address));
    expect(holdersDue(all, visible, 3, NOW, visible)).toEqual([old]);
    // Not open: it waits for the usual half hour.
    expect(holdersDue(all, visible, 3, NOW)).toEqual([]);
  });
});

describe("holder counts", () => {
  it("reads Jupiter's counts and skips tokens without one", () => {
    const results = [{ id: "A", holderCount: 11_096 }, { id: "B" }, { id: "C", holderCount: "9" }, null, { id: "D", holderCount: 12.6 }];
    expect(holderCounts(results)).toEqual(new Map([["A", 11_096], ["D", 13]]));
    expect(holderCounts({ id: "A" })).toEqual(new Map());
  });

  it("refreshes tokens on screen every 2 minutes first, then listed ones by market cap every 20", () => {
    const stale = priced(10_000, {}, { holderCountAt: NOW - 3 * MIN });
    const recent = priced(10_000, {}, { holderCountAt: NOW - MIN });
    const never = priced(5_000, {});
    const big = priced(500_000, {}, { holderCountAt: NOW - 25 * MIN });
    const bigRecent = priced(400_000, {}, { holderCountAt: NOW - 10 * MIN });
    const mid = priced(80_000, {});
    const dust = priced(3_000, {});
    const unpriced = tracked({ marketCap: 9_000 });
    const pons = priced(50_000, {}, { chain: "rh" });
    const all = [big, stale, dust, recent, unpriced, mid, never, pons, bigRecent];
    const visible = new Set([stale, recent, never, pons].map((t) => t.address));
    expect(holderCountsDue(all, visible, 100, NOW)).toEqual([never, stale, big, mid]);
    expect(holderCountsDue(all, visible, 2, NOW)).toEqual([never, stale]);
  });
});

describe("issuerChecksDue", () => {
  it("asks Jupiter about unconfirmed claims, and again 6 hours after it declined", () => {
    const fresh = priced(1, {}, { issuerClaim: "ondo" });
    const declined = priced(1, {}, { issuerClaim: "xstocks", issuerCheckedAt: NOW - HOUR });
    const longAgo = priced(1, {}, { issuerClaim: "xstocks", issuerCheckedAt: NOW - 7 * HOUR });
    const confirmed = priced(1, {}, { issuerClaim: "ondo", issuer: "ondo" });
    const none = priced(1, {});
    expect(issuerChecksDue([fresh, declined, longAgo, confirmed, none], 5, NOW)).toEqual([fresh, longAgo]);
  });
});
