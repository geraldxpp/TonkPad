// @vitest-environment node
import { decodeEventLog, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { curveFilled, TOTAL_SUPPLY } from "@/shared/tonk/curve";
import { creditsDue, snapshotsDue } from "../src/smart/sweep";
import { SmartWallets } from "../src/smart/wallets";
import { parseSnapshot } from "../src/snapshot";
import { TokenStore } from "../src/store";
import { TonkBook } from "../src/tonk/book";
import { CONFIRMATIONS, TonkFeed } from "../src/tonk/feed";
import { POOL_EVENTS } from "../src/tonk/abi";
import { DUST, systemRole } from "../src/tonk/holders";
import { curvePrice, poolPrice } from "../src/tonk/state";
import { toToken } from "../src/tokens";
import { listView } from "../src/views/list";
import { NOW } from "./fixtures";
import { MIGRATOR, POOL_MANAGER, type TonkChain } from "./tonk-chain";
import { CONFIG, FakeRpc, SYSTEM } from "./tonk-rpc";
import { ALICE, CAROL, CREATOR, LAUNCH_BLOCK, LAUNCH_TIME, MALLORY, MARKS, TOKEN, tonkScenario } from "./tonk-scenario";

const ETH_USD = 3_000;

function follow(chain: TonkChain, store = new TokenStore(), cursor: number | null = null) {
  const rpc = new FakeRpc(chain);
  const book = new TonkBook(store, SYSTEM);
  const feed = new TonkFeed(rpc, CONFIG, book, cursor);
  /** Polls until the feed reaches the head (a failed poll is tried again, as the worker's loop does). */
  const run = async (head = rpc.head) => {
    rpc.head = head;
    for (let i = 0; i < 40 && (feed.cursor ?? 0) < head - CONFIRMATIONS; i++) await feed.poll().catch(() => undefined);
    book.refresh(NOW, ETH_USD);
  };
  return { rpc, book, feed, store, run };
}

/** The scenario's own sums: every non-system wallet holding a whole token or more, largest first. */
function counted(chain: TonkChain): bigint[] {
  return [...chain.balances].filter(([address, amount]) => amount >= DUST && systemRole(address, SYSTEM) === null).map(([, amount]) => amount).sort((a, b) => (b > a ? 1 : -1));
}

const tab = (store: TokenStore, name: "trending" | "new" | "graduating" | "graduated" | "gainers" | "locked") =>
  listView(store.all(), { chain: "all", pad: "all", tab: name, tf: "24h", q: "", limit: 50 }, NOW).rows.map((row) => row.address);

describe("the tonkfun.fun feed, from the launchpad's deployment block", () => {
  it("lists a launch as Explore shows it: cleaned name, chain rh, launchpad tonk, curve price and badges", async () => {
    const chain = tonkScenario();
    const { store, run } = follow(chain);
    await run(MARKS.transferred + 1 + CONFIRMATIONS);
    const token = store.get(TOKEN);
    expect(token).toBeDefined();
    const t = toToken(token!, NOW);
    expect([t.chain, t.launchpad, t.ticker, t.creator]).toEqual(["rh", "tonk", "TONK", "0x00…ffee"]);
    // Direction marks and zero-width spaces dropped, spaces collapsed, at most 48 characters.
    expect(t.name.startsWith("Tonk Test One xxx")).toBe(true);
    expect([...t.name].length).toBe(48);
    expect(t.flags).toMatchObject({ locked: true, crew: "2%", agent: true, isNew: false });
    expect(t.shield).toBe(true);
    // Priced from the last curve trade's reserves, at the ETH price now.
    const curve = chain.at(MARKS.transferred).curve;
    expect(t.marketCap).toBeCloseTo(curvePrice(curve.virtualEth, curve.virtualTokens) * 1e9 * ETH_USD, 6);
    expect(t.curve).toBeCloseTo(curveFilled(curve.tokensLeft), 9);
    expect(token!.createdAt).toBe(LAUNCH_TIME * 1000);
    // A sniper, Alice, Bob and Alice's sell: four trades and the creator's buy inside the launch.
    expect(token!.windows.h24).toMatchObject({ buys: 4, sells: 1 });
    expect(store.size).toBe(1);
  });

  it("follows the curve to graduation, then only the token's own pool", async () => {
    const chain = tonkScenario();
    const { store, run } = follow(chain);
    await run();
    const token = store.get(TOKEN)!;
    expect(token.graduated).toBe(true);
    expect(token.curve).toBe(1);
    // The last swap on the guarded pool sets the price; the look-alike pool's later swap and the spoofed one don't.
    const ours = chain.logs.filter((log) => log.address === POOL_MANAGER && log.topics[1] === token.tonk!.pool!.id);
    expect(ours).toHaveLength(2);
    const last = ours[ours.length - 1];
    const { args } = decodeEventLog({ abi: POOL_EVENTS, data: last.data as Hex, topics: last.topics as [Hex, ...Hex[]] });
    expect(token.tonk!.spot).toBe(poolPrice(args.sqrtPriceX96));
    // Curve: the launch buy, 3 buys, 1 sell and the graduating buy; pool: Erin's buy and Alice's sell.
    expect(token.windows.h24).toMatchObject({ buys: 6, sells: 2 });
    expect(token.marketCap).toBeCloseTo(token.tonk!.spot * 1e9 * ETH_USD, 6);
    expect(token.nextRefreshAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("counts holders exactly from Transfers: wallet-to-wallet and after graduation, system addresses and dust left out", async () => {
    const chain = tonkScenario();
    const { store, run } = follow(chain);
    await run();
    const s = store.get(TOKEN)!.tonk!;
    for (const [address, amount] of chain.balances) expect(BigInt(s.balances[address] ?? "0"), address).toBe(amount > BigInt(0) ? amount : BigInt(0));
    const expected = counted(chain);
    const token = store.get(TOKEN)!;
    expect(token.holderCount).toBe(expected.length);
    // Carol only ever received tokens from Bob; Mallory's came out of the look-alike pool.
    expect(BigInt(s.balances[CAROL])).toBe(BigInt(10) ** BigInt(24));
    expect(BigInt(s.balances[MALLORY] ?? "0")).toBeGreaterThan(BigInt(0));
    expect(s.balances[ALICE]).toBeUndefined();
    const top10 = expected.slice(0, 10).reduce((sum, amount) => sum + amount, BigInt(0));
    expect(token.top10Share).toBeCloseTo(Number((top10 * BigInt(1_000_000)) / TOTAL_SUPPLY) / 1e6, 6);
    // The migrator passed its 200M on to the pool and burned the remainder: it holds nothing.
    expect(s.balances[MIGRATOR]).toBeUndefined();
    expect(BigInt(s.balances[CREATOR])).toBe(chain.balances.get(CREATOR));
  });

  it("puts the launch in Explore's tabs by the same rules as every other token", async () => {
    const chain = tonkScenario();
    const before = follow(chain);
    await before.run(MARKS.transferred + 1 + CONFIRMATIONS);
    expect(tab(before.store, "locked")).toEqual([TOKEN]);
    expect(tab(before.store, "new")).toEqual([TOKEN]);
    expect(tab(before.store, "graduated")).toEqual([]);
    const after = follow(chain);
    await after.run();
    for (const name of ["trending", "new", "graduated", "gainers", "locked"] as const) expect(tab(after.store, name), name).toEqual([TOKEN]);
    expect(tab(after.store, "graduating")).toEqual([]);
  });

  it("carries on from a snapshot's cursor as if it had never stopped", async () => {
    const chain = tonkScenario();
    const whole = follow(chain);
    await whole.run();
    const first = follow(chain);
    await first.run(MARKS.traded + CONFIRMATIONS + 1);
    const saved = parseSnapshot(JSON.stringify({ tokens: first.store.toJSON(), ponsBlock: null, tonk: { launchpad: CONFIG.launchpad, cursor: first.feed.cursor } }));
    const store = new TokenStore();
    store.restore(saved.tokens, NOW);
    const second = follow(chain, store, saved.tonk?.cursor ?? null);
    await second.run();
    const strip = (store: TokenStore) => ({ ...store.get(TOKEN)!, mcapSeries: [], tonk: { ...store.get(TOKEN)!.tonk!, holdersDirty: false } });
    expect(strip(second.store)).toEqual(strip(whole.store));
  });

  it("halves its window while the RPC refuses long ranges, and applies nothing from a window it couldn't read whole", async () => {
    const chain = tonkScenario();
    const whole = follow(chain);
    await whole.run();
    const narrow = follow(chain);
    narrow.rpc.maxRange = 1_000;
    await narrow.run();
    expect(narrow.store.get(TOKEN)!.tonk!.balances).toEqual(whole.store.get(TOKEN)!.tonk!.balances);
    expect(narrow.store.get(TOKEN)!.windows).toEqual(whole.store.get(TOKEN)!.windows);

    const broken = follow(chain);
    broken.rpc.fail = (call) => call.method === "eth_call";
    await expect(broken.feed.poll()).rejects.toThrow();
    expect(broken.store.size).toBe(0);
    expect(broken.feed.cursor).toBe(CONFIG.startBlock - 1);
  });

  it("follows no pool when the migrator's guard serves someone else", async () => {
    const chain = tonkScenario();
    const { rpc, store, run } = follow(chain);
    rpc.guardMigrator = "0x000000000000000000000000000000000000beef";
    await run();
    const token = store.get(TOKEN)!;
    expect(token.graduated).toBe(true);
    expect(token.tonk!.pool).toBeNull();
    expect(token.windows.h24).toMatchObject({ buys: 5, sells: 1 });
  });

  it("starts at the deployment block, and stays the confirmations behind the head", async () => {
    const chain = tonkScenario();
    const { rpc, feed } = follow(chain);
    await feed.poll();
    const ranges = rpc.calls.filter((call) => call.method === "eth_getLogs").map((call) => (call.params[0] as { fromBlock: string }).fromBlock);
    expect(Number(BigInt(ranges[0]))).toBe(CONFIG.startBlock);
    expect(feed.cursor).toBe(rpc.head - CONFIRMATIONS);
    expect(LAUNCH_BLOCK).toBeGreaterThan(CONFIG.startBlock);
  });
});


describe("tonkfun.fun launches in the worker's store", () => {
  it("are kept past a day and never handed to DexScreener, Helius or smart money's graduate checks", async () => {
    const chain = tonkScenario();
    const { store, run } = follow(chain);
    await run();
    const later = NOW + 3 * 24 * 3_600_000;
    expect(store.prune(later)).toBe(0);
    expect(store.dueForRefresh("rh", later, 50)).toEqual([]);
    expect(store.needingAssets("rh", new Set(), 50, later)).toEqual([]);
    const smart = new SmartWallets();
    expect(snapshotsDue(store.all(), smart, NOW)).toEqual([]);
    expect(creditsDue(store.all(), smart, NOW + 12 * 3_600_000)).toEqual([]);
    store.restore(store.toJSON(), later);
    expect(store.get(TOKEN)!.nextRefreshAt).toBe(Number.MAX_SAFE_INTEGER);
  });
});
