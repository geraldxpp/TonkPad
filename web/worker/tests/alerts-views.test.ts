import { describe, expect, it } from "vitest";
import type { MissionLockJson } from "@/shared/tonk/mission";
import { MAX_ALERT_IDS } from "@/shared/types/live";
import { TokenStore } from "../src/store";
import type { TonkState } from "../src/tonk/state";
import { LATEST_LAUNCHES, launchesView, parseIds, pricesView } from "../src/views/alerts";
import { createViews } from "../src/views/cache";
import { address, HOUR, MIN, NOW, priced, tracked } from "./fixtures";

const EVM = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";

function launchState(lock: MissionLockJson | null): TonkState {
  return {
    launchTx: "0x1",
    launchBlock: 1,
    launchTime: NOW - HOUR,
    crewBps: 0,
    creatorBps: 0,
    devBought: "0",
    lock,
    virtualEth: "1",
    virtualTokens: "1",
    tokensLeft: "0",
    realEth: "0",
    startPrice: 0,
    spot: 0,
    trades: [],
    pool: null,
    agent: false,
    balances: {},
  };
}

const LOCK: MissionLockJson = { type: "time", lockedBps: 1_000, start: 100, end: 2_000_000_000, total: "100", claimed: "0", checkpoint: "0" };

function launch(label: string, ageMs: number, lock: MissionLockJson | null = null) {
  const hex = Buffer.from(label).toString("hex").padEnd(40, "0").slice(0, 40);
  return tracked({ address: `0x${hex}`, chain: "rh", launchpad: "tonk", tonk: launchState(lock) }, ageMs);
}

describe("alert views", () => {
  it("reads at most 25 valid addresses, each once", () => {
    const many = Array.from({ length: 40 }, (_, i) => address(`Mint${i}x`)).join(",");
    expect(parseIds(many)).toHaveLength(MAX_ALERT_IDS);
    expect(parseIds(`${EVM}, ${EVM},not-an-address,,`)).toEqual([EVM]);
    expect(parseIds(null)).toEqual([]);
  });

  it("prices tracked tokens it has priced, EVM ones in any case, and nothing else", () => {
    const store = new TokenStore();
    const sol = priced(50_000, { h1: { change: 12 }, h24: { change: -30 } }, { priceUsd: 0.00005, marketAt: NOW });
    const rh = priced(80_000, {}, { address: EVM, chain: "rh", priceUsd: 0.00008, marketAt: NOW });
    const unpriced = tracked({ marketAt: 0 });
    for (const t of [sol, rh, unpriced]) store.add(t);
    const { prices } = pricesView(store, [sol.address, EVM.toLowerCase(), unpriced.address, address("Missing")]);
    expect(prices.map((p) => p.address)).toEqual([sol.address, EVM]);
    expect(prices[0]).toMatchObject({ priceUsd: 0.00005, marketCap: 50_000, change1h: 12, change24h: -30, at: NOW });
  });

  it("never marks a token opened, so a price check spends no Helius credits", () => {
    const store = new TokenStore();
    const sol = priced(50_000, {}, { priceUsd: 0.00005, marketAt: NOW });
    store.add(sol);
    const views = createViews(store, { solUsd: 100, ethUsd: null, rhGasGwei: null }, ["pump"]);
    pricesView(store, [sol.address]);
    launchesView(store, [sol.address], NOW);
    expect(views.openedAddresses().size).toBe(0);
  });

  it("lists the newest tonkfun.fun launches and those asked for, with graduation and lock as they stand", () => {
    const store = new TokenStore();
    const old = launch("old", 30 * 24 * HOUR, { ...LOCK, claimed: "40" });
    store.add({ ...old, graduated: true, graduatedAt: NOW - HOUR });
    for (let i = 0; i < LATEST_LAUNCHES + 2; i += 1) store.add(launch(`new${i}`, i * 1_000));
    store.add(tracked());
    const all = launchesView(store, [], NOW).launches;
    // The 20 newest, and the old one too: it graduated within the last two hours.
    expect(all).toHaveLength(LATEST_LAUNCHES + 1);
    expect(all[0].address).toBe(launch("new0", 0).address);
    const asked = launchesView(store, [old.address], NOW).launches.find((l) => l.address === old.address);
    expect(asked).toMatchObject({ graduatedAt: NOW - HOUR, lockEnd: LOCK.end * 1_000, lockClaimed: "40" });
    const unlocked = launch("bare", 1_000);
    store.add(unlocked);
    expect(launchesView(store, [unlocked.address], NOW).launches.find((l) => l.address === unlocked.address)).toMatchObject({ lockEnd: null, lockClaimed: null, graduatedAt: null, launchpad: "tonk", chain: "rh" });
  });

  it("lists each followed launchpad's graduations from the last two hours and its hot launches, and any token asked for", () => {
    const store = new TokenStore();
    const recent = tracked({ graduated: true, graduatedAt: NOW - HOUR });
    const stale = tracked({ graduated: true, graduatedAt: NOW - 3 * HOUR });
    const hot = priced(10_000, { m5: { buys: 30 }, h1: { buys: 30 }, h24: { buys: 30 } }, {}, 10 * MIN);
    const oldHot = priced(10_000, { m5: { buys: 30 }, h1: { buys: 30 }, h24: { buys: 300 } }, {}, 3 * HOUR);
    const moon = tracked({ launchpad: "moon", graduated: true, graduatedAt: NOW - HOUR });
    const quiet = tracked();
    for (const t of [recent, stale, hot, oldHot, moon, quiet]) store.add(t);
    const listed = launchesView(store, [quiet.address], NOW).launches;
    const byAddress = new Map(listed.map((l) => [l.address, l]));
    expect([...byAddress.keys()].sort()).toEqual([recent.address, hot.address, quiet.address].sort());
    expect(byAddress.get(hot.address)).toMatchObject({ hot: true, launchpad: "pump", chain: "sol" });
    expect(byAddress.get(recent.address)).toMatchObject({ graduatedAt: NOW - HOUR, hot: false });
    expect(byAddress.get(quiet.address)).toMatchObject({ graduatedAt: null, hot: false });
  });
});
