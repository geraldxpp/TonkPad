// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { holdersDue, issuerChecksDue } from "../src/safety";
import { base58Decode, base58Encode, isOnCurve, isWalletAddress } from "../src/solana";
import { fetchTopHolders, topHolderShare } from "../src/sources/holders";
import { HOUR, MIN, NOW, priced } from "./fixtures";
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

  function stubHelius() {
    const methods: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const { method } = JSON.parse(init.body) as { method: string };
      methods.push(method);
      const result =
        method === "getTokenLargestAccounts"
          ? { value: fixture.tokenAccounts.map((t) => ({ address: t.account, amount: "1000" })) }
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
    expect(known).toEqual({ share: 0.5, supply: 10_000 });
    const unknown = await fetchTopHolders("key", mint, null, () => calls++);
    expect(calls).toBe(5);
    expect(unknown.supply).toBe(10_000);
  });

  it("reports an RPC error instead of a share", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "boom" } })));
    await expect(fetchTopHolders("key", mint, 1, () => {})).rejects.toThrow("getTokenLargestAccounts: boom");
  });
});

describe("holdersDue", () => {
  it("picks Solana tokens on screen worth $20K+: never measured first, then the stalest", () => {
    const fresh = priced(30_000, {});
    const stale = priced(90_000, {}, { holdersAt: NOW - 40 * MIN });
    const recent = priced(25_000, {}, { holdersAt: NOW - 5 * MIN });
    const small = priced(10_000, {});
    const robinhood = priced(50_000, {}, { chain: "rh" });
    const stock = priced(60_000, {}, { issuer: "xstocks" });
    const offScreen = priced(70_000, {});
    const all = [stale, recent, small, robinhood, stock, offScreen, fresh];
    const visible = new Set(all.filter((t) => t !== offScreen).map((t) => t.address));
    expect(holdersDue(all, visible, 3, NOW)).toEqual([fresh, stale]);
    expect(holdersDue(all, visible, 1, NOW)).toEqual([fresh]);
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
