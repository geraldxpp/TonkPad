// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { creatorLock, isLockedMission, lockedAt, lockedShare, poolLockedOrBurned } from "../src/locks";
import type { TrackedToken } from "../src/model";
import { missionScore } from "../src/score";
import { fetchStreamLock, parseStreamLock, type StreamLock } from "../src/sources/streamflow";
import { toToken } from "../src/tokens";
import { listView } from "../src/views/list";
import { HOUR, NOW, priced, tracked } from "./fixtures";
import holders from "./fixtures/holders.json";
import fixture from "./fixtures/streamflow.json";

const DAY = 24 * HOUR;
const record = (name: keyof typeof fixture.records) => fixture.records[name];
const parse = (name: keyof typeof fixture.records) => {
  const lock = parseStreamLock(Buffer.from(record(name).data, "base64"));
  if (!lock) throw new Error(`unreadable ${name}`);
  return lock;
};
const iso = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 16);
const SUPPLY = 1e15;

/** A token whose supply holds `lock`, launched by `creator`. */
function lockedToken(lock: StreamLock, over: Partial<TrackedToken> = {}): TrackedToken {
  return priced(60_000, {}, { address: lock.mint, supply: SUPPLY, locks: [lock], mintRevoked: true, freezeRevoked: true, ...over }, 2 * HOUR);
}

describe("Streamflow records", () => {
  it("reads a creator's 30-day token lock", () => {
    const lock = parse("CLEFT");
    expect(lock).toMatchObject({ escrow: record("CLEFT").escrow, mint: record("CLEFT").mint, firm: true, canceledAt: 0 });
    expect(lock.sender).toBe(lock.recipient);
    expect([iso(lock.start), iso(lock.cliff), iso(lock.end)]).toEqual(["2026-11-07T05:16", "2026-12-07T05:16", "2026-12-07T05:16"]);
    expect(lock.deposited).toBe(Number(record("CLEFT").balance));
  });

  it("reads a year-long lock and an 18-month vesting to another wallet", () => {
    expect(iso(parse("GHOST").cliff)).toBe("2027-11-10T08:00");
    const vesting = parse("LARP");
    expect(vesting.sender).not.toBe(vesting.recipient);
    expect(vesting).toMatchObject({ period: 86_400, perPeriod: 456_204_379_563, cliffAmount: 0, deposited: 250_000_000_000_000, firm: true });
    expect(iso(vesting.end)).toBe("2028-05-07T21:01");
  });

  it("releases nothing before the cliff, then the cliff amount and a set amount each period", () => {
    const lock = parse("CLEFT");
    expect(lockedAt(lock, lock.cliff - 1)).toBe(lock.deposited);
    expect(lockedAt(lock, lock.cliff + 1)).toBe(0);
    const vesting = parse("LARP");
    expect(lockedAt(vesting, vesting.cliff + 10 * 86_400)).toBe(vesting.deposited - 10 * vesting.perPeriod);
    expect(lockedAt(vesting, vesting.end + 86_400)).toBe(0);
    expect(lockedAt({ ...lock, canceledAt: lock.start + 5 }, lock.start + 10)).toBe(0);
  });

  it("treats a lock someone can cancel or speed up as no lock", () => {
    const data = Buffer.from(record("CLEFT").data, "base64");
    data[457] = 1; // cancelable_by_sender
    expect(parseStreamLock(data)?.firm).toBe(false);
    expect(parseStreamLock(new Uint8Array(100))).toBeNull();
  });
});

describe("Locked Missions: the Locked badge and its tab", () => {
  const cleft = parse("CLEFT");
  const tonk = (lock: StreamLock, over: Partial<TrackedToken> = {}) => lockedToken(lock, { launchpad: "tonk", ...over });

  it("are reserved for Tonkpad launches; other launchpads' locks count in the score only", () => {
    // CLEFT locks 5.02% of supply until 7 Dec, about 31 days after NOW.
    expect(lockedShare(lockedToken(cleft), NOW)).toBeCloseTo(0.0502, 4);
    expect(isLockedMission(lockedToken(cleft), NOW)).toBe(false);
    expect(toToken(lockedToken(cleft), NOW).flags.locked).toBe(false);
    expect(isLockedMission(tonk(cleft), NOW)).toBe(true);
    expect(toToken(tonk(cleft), NOW).flags.locked).toBe(true);
  });

  it("need a firm lock with 7+ days left holding 1%+ of supply", () => {
    expect(isLockedMission(tonk(cleft), (cleft.cliff - 5 * 86_400) * 1000)).toBe(false);
    expect(isLockedMission(tonk({ ...cleft, deposited: 0.005 * SUPPLY }), NOW)).toBe(false);
    expect(isLockedMission(tonk({ ...cleft, firm: false }), NOW)).toBe(false);
    // A lock of some other token's supply.
    expect(isLockedMission(tonk({ ...cleft, mint: "SomeOtherMint" }, { address: cleft.mint }), NOW)).toBe(false);
  });

  it("list Tonkpad launches in the tab, the biggest locked share first", () => {
    const small = tonk(cleft);
    const pump = lockedToken({ ...cleft, mint: "PumpLock" + "1".repeat(36), deposited: 0.5 * SUPPLY }, { address: "PumpLock" + "1".repeat(36) });
    const big = tonk({ ...cleft, mint: "BigLock" + "1".repeat(37), deposited: 0.2 * SUPPLY }, { address: "BigLock" + "1".repeat(37) });
    const query = { chain: "all", pad: "all", tab: "locked", tf: "24h", q: "", limit: 10 } as const;
    expect(listView([small, pump, priced(80_000, {}), big], query, NOW).rows.map((t) => t.address)).toEqual([big.address, small.address]);
  });
});

describe("locks in the Mission score", () => {
  const cleft = parse("CLEFT");

  it("adds 10 when the creator locked half their tokens for 30+ days, and waives their launch buy", () => {
    const own = { creator: cleft.sender, creatorBuyShare: 0.08 };
    expect(creatorLock(lockedToken(cleft, own), NOW)).toEqual({ ofHoldings: 1, ofLaunchBuy: expect.closeTo(0.628, 3) });
    const without = missionScore(lockedToken(cleft, { ...own, locks: [] }), NOW).score;
    // The −8 for an 8% launch buy is waived and the lock adds 10.
    expect(missionScore(lockedToken(cleft, own), NOW).score).toBe(without + 18);
  });

  it("counts only the creator's own locks, and only with 30+ days left", () => {
    expect(creatorLock(lockedToken(cleft, { creator: "SomeoneElse" }), NOW)).toEqual({ ofHoldings: 0, ofLaunchBuy: 0 });
    const late = (cleft.cliff - 20 * 86_400) * 1000;
    expect(creatorLock(lockedToken(cleft, { creator: cleft.sender }), late).ofHoldings).toBe(0);
    // Half of the creator's tokens: the lock against a wallet holding as much again.
    expect(creatorLock(lockedToken(cleft, { creator: cleft.sender, creatorHeld: cleft.deposited }), NOW).ofHoldings).toBe(0.5);
  });

  it("gives the graduation +10 for burned or locked pools: Pump.fun and Pons, not Bonk.fun yet", () => {
    const grad = (launchpad: TrackedToken["launchpad"]) => tracked({ launchpad, graduated: true });
    expect([poolLockedOrBurned(grad("pump")), poolLockedOrBurned(grad("pons")), poolLockedOrBurned(grad("bonk"))]).toEqual([true, true, false]);
    expect(poolLockedOrBurned(tracked({ launchpad: "pump" }))).toBe(false);
    expect(missionScore(grad("pump"), NOW + DAY).score - missionScore(grad("bonk"), NOW + DAY).score).toBe(10);
  });
});

describe("fetchStreamLock", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("finds a record by its escrow and costs 10 credits", async () => {
    const bodies: Array<{ method: string; params: unknown[] }> = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: [{ pubkey: "R", account: { data: [record("GHOST").data, "base64"] } }] }));
    });
    let credits = 0;
    const lock = await fetchStreamLock("key", record("GHOST").escrow, (n) => (credits += n));
    expect(lock?.mint).toBe(record("GHOST").mint);
    expect(credits).toBe(10);
    expect(bodies[0].method).toBe("getProgramAccounts");
    expect(JSON.stringify(bodies[0].params)).toContain(`"offset":209,"bytes":"${record("GHOST").escrow}"`);
    // A record for some other escrow, or none, is no lock.
    expect(await fetchStreamLock("key", record("CLEFT").escrow, () => {})).toBeNull();
  });
});

describe("finding locks during holder checks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("spots a Streamflow escrow among the largest accounts and reads its record once", async () => {
    const { createSafetyChecks } = await import("../src/safety");
    const { TokenStore } = await import("../src/store");
    const ghost = record("GHOST");
    const wallet = holders.wallets[0];
    const methods: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const { method } = JSON.parse(init.body) as { method: string };
      methods.push(method);
      const result =
        method === "getTokenLargestAccounts"
          ? { value: [{ address: ghost.escrow, amount: ghost.balance }, { address: "WalletTokenAccount1111111111111111111111111", amount: "1000" }] }
          : method === "getMultipleAccounts"
            ? { value: [{ data: { parsed: { info: { owner: ghost.escrow } } } }, { data: { parsed: { info: { owner: wallet } } } }] }
            : [{ pubkey: "R", account: { data: [ghost.data, "base64"] } }];
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
    const store = new TokenStore();
    const token = priced(60_000, {}, { address: ghost.mint, supply: SUPPLY });
    store.add(token);
    let credits = 0;
    const safety = createSafetyChecks({
      store,
      visible: () => new Set([token.address]),
      heliusApiKey: "key",
      jupiterApiKey: null,
      blockscoutApiKey: null,
      onHeliusCall: (n = 1) => (credits += n),
      fail: () => {},
    });
    await safety.refreshHolders();
    expect(methods).toEqual(["getTokenLargestAccounts", "getMultipleAccounts", "getProgramAccounts"]);
    expect(credits).toBe(12);
    expect(token.locks?.map((l) => l.escrow)).toEqual([ghost.escrow]);
    // The escrow isn't a wallet, so it stays out of the top-10 share and smart money.
    expect(token.topWallets).toEqual([wallet]);
    // A Pump.fun token: the lock counts in its score, but Locked Missions are Tonkpad's.
    expect(toToken(token, NOW).flags.locked).toBe(false);
  });
});
