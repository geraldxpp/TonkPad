// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrackedToken } from "../src/model";
import { newPonsState } from "../src/pons/curve";
import { chainHoldersDue, createSafetyChecks } from "../src/safety";
import { walletsOf } from "../src/smart/sweep";
import { fetchChainHolders, parseHolders, parseTokenInfo, summarize } from "../src/sources/blockscout";
import { NATIVE_ETH } from "../src/sources/pons";
import { TokenStore } from "../src/store";
import { toToken } from "../src/tokens";
import { HOUR, MIN, NOW, priced } from "./fixtures";

const WALLET = "0xAbCd000000000000000000000000000000000001";
const POOL = "0x0000000000000000000000000000000000000Aaa";
const holdersPage = {
  items: [
    { address: { hash: POOL, is_contract: true }, token_id: null, value: "500000000000000000000000000" },
    { address: { hash: WALLET, is_contract: false }, token_id: null, value: "80000000000000000000000000" },
    { address: { hash: "0x00000000000000000000000000000000000000b2", is_contract: false }, token_id: null, value: "20000000000000000000000000" },
  ],
  next_page_params: { items_count: 50 },
};

/** A Pons token that graduated an hour before NOW, worth $60K. */
function graduatedPons(over: Partial<TrackedToken> = {}): TrackedToken {
  const token = priced(60_000, {}, { chain: "rh", launchpad: "pons", graduated: true, graduatedAt: NOW - HOUR, holderCount: 13, ...over });
  token.pons = newPonsState({ curve: "0xcurve", quote: NATIVE_ETH, quoteDecimals: 18, threshold: 4.2, launchTx: "0x1" });
  return token;
}

describe("Blockscout responses", () => {
  it("reads the holder count under either spelling", () => {
    expect(parseTokenInfo({ holders_count: "1204", total_supply: "1000" })).toEqual({ count: 1204, supply: 1000 });
    expect(parseTokenInfo({ holders: "88" })).toEqual({ count: 88, supply: null });
    expect(parseTokenInfo("nope")).toEqual({ count: null, supply: null });
  });

  it("reads holders, lowercased, and marks contracts", () => {
    const holders = parseHolders(holdersPage);
    expect(holders[1]).toEqual({ address: WALLET.toLowerCase(), contract: false, value: 8e25 });
    expect(holders[0].contract).toBe(true);
    expect(parseHolders({ items: [{ address_hash: "0xAB", is_contract: true, value: "5" }, { address: {}, value: "1" }] })).toEqual([
      { address: "0xab", contract: true, value: 5 },
    ]);
    expect(parseHolders({})).toEqual([]);
  });

  it("leaves pools and lockers out of the top-10 share and the wallets", () => {
    const summary = summarize(1204, 1e27, parseHolders(holdersPage));
    expect(summary.top10Share).toBeCloseTo(0.1, 12);
    expect(summary.wallets).toEqual([WALLET.toLowerCase(), "0x00000000000000000000000000000000000000b2"]);
    expect(summarize(5, null, []).top10Share).toBeNull();
  });
});

describe("fetchChainHolders", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for the token, then its holders, with the key, and counts 50 credits", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(url.includes("/holders") ? holdersPage : { holders_count: "1204", total_supply: "1000000000000000000000000000" }));
    });
    let credits = 0;
    const out = await fetchChainHolders("secret-key", "0xtoken", (n) => (credits += n));
    expect(urls).toEqual([
      "https://api.blockscout.com/4663/api/v2/tokens/0xtoken?apikey=secret-key",
      "https://api.blockscout.com/4663/api/v2/tokens/0xtoken/holders?apikey=secret-key",
    ]);
    expect(credits).toBe(50);
    expect(out).toMatchObject({ count: 1204, wallets: [WALLET.toLowerCase(), "0x00000000000000000000000000000000000000b2"] });
  });

  it("names only the status when a call fails, never the key", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 401 }));
    await expect(fetchChainHolders("secret-key", "0xtoken", () => {})).rejects.toThrow(/^Blockscout HTTP 401$/);
  });
});

describe("graduated Pons holders", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("checks graduated Pons tokens on screen, hourly, never-checked first", () => {
    const fresh = graduatedPons();
    const stale = graduatedPons({ holdersAt: NOW - 2 * HOUR });
    const recent = graduatedPons({ holdersAt: NOW - 10 * MIN });
    const onCurve = graduatedPons({ graduated: false });
    const offScreen = graduatedPons();
    const solana = priced(60_000, {}, { graduated: true });
    const all = [stale, recent, onCurve, offScreen, solana, fresh];
    const visible = new Set(all.filter((t) => t !== offScreen).map((t) => t.address));
    expect(chainHoldersDue(all, visible, 5, NOW)).toEqual([fresh, stale]);
  });

  it("shows Blockscout's count, not the stale curve count, and feeds smart money its wallets", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      new Response(JSON.stringify(url.includes("/holders") ? holdersPage : { holders_count: "1204", total_supply: "1000000000000000000000000000" })),
    );
    const token = graduatedPons();
    expect(toToken(token, NOW).holders).toBeNull();
    const store = new TokenStore();
    store.add(token);
    const safety = createSafetyChecks({
      store,
      visible: () => new Set([token.address]),
      heliusApiKey: null,
      jupiterApiKey: null,
      blockscoutApiKey: "key",
      onHeliusCall: () => {},
      fail: () => {},
    });
    await safety.refreshChainHolders(NOW);
    expect(toToken(token, NOW).holders).toBe(1204);
    expect(token.top10Share).toBeCloseTo(0.1, 12);
    expect(walletsOf(token)).toEqual([WALLET.toLowerCase(), "0x00000000000000000000000000000000000000b2"]);
    expect(safety.chainCredits()).toEqual({ day: new Date(NOW).toISOString().slice(0, 10), used: 50 });
  });

  it("shows no count when the first check fails", async () => {
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    const token = graduatedPons();
    const store = new TokenStore();
    store.add(token);
    const fail = vi.fn();
    const safety = createSafetyChecks({
      store,
      visible: () => new Set([token.address]),
      heliusApiKey: null,
      jupiterApiKey: null,
      blockscoutApiKey: "key",
      onHeliusCall: () => {},
      fail,
    });
    await safety.refreshChainHolders(NOW);
    expect(fail).toHaveBeenCalledWith("blockscout", expect.any(Error));
    expect(toToken(token, NOW).holders).toBeNull();
  });
});
