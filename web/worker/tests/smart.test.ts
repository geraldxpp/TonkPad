// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrackedToken } from "../src/model";
import { newPonsState } from "../src/pons/curve";
import { trackHolders } from "../src/pons/holders";
import { capAtGraduation, createSmartMoney, creditsDue, GRADUATE_CHECKS_PER_MINUTE, heldUp, snapshotsDue, walletsOf } from "../src/smart/sweep";
import { type Graduate, SMART_WINDOW, SmartWallets } from "../src/smart/wallets";
import { NATIVE_ETH } from "../src/sources/pons";
import { TokenStore } from "../src/store";
import { HOUR, MIN, NOW, tracked } from "./fixtures";
import fixture from "./fixtures/holders.json";

const DAY = 24 * HOUR;
const grad = (creator: string, at = NOW): Graduate => ({ chain: "sol", creator, at });

/** A Pons token with a curve that tracks wallets, launched by `creator`. */
function ponsToken(creator: string, over: Partial<TrackedToken> = {}): TrackedToken {
  const token = tracked({ chain: "rh", launchpad: "pons", creator, ...over });
  token.pons = newPonsState({ curve: "0xcurve", quote: NATIVE_ETH, quoteDecimals: 18, threshold: 4.2, launchTx: "0x1" });
  return token;
}

describe("SmartWallets", () => {
  it("makes a wallet smart money once graduates from 3 different creators credited it", () => {
    const smart = new SmartWallets();
    smart.credit("T1", grad("C1"), ["W", "X"]);
    smart.credit("T2", grad("C2"), ["W", "X"]);
    smart.credit("T3", grad("C2"), ["X"]); // three graduates for X, but two creators
    smart.refresh(NOW);
    expect(smart.count(["W", "X"])).toBe(0);
    smart.credit("T4", grad("C3"), ["W"]);
    smart.refresh(NOW);
    expect(smart.count(["W", "X", "nobody"])).toBe(1);
    expect(smart.stats()).toEqual({ wallets: 2, graduates: 4, smart: 1 });
  });

  it("never credits the creator, and credits each graduate once", () => {
    const smart = new SmartWallets();
    expect(smart.credit("T1", grad("C1"), ["C1", "W", "W"])).toBe(true);
    expect(smart.credit("T1", grad("C1"), ["Z"])).toBe(false);
    expect(smart.toJSON().credits).toEqual({ W: ["T1"] });
  });

  it("forgets graduates after 30 days, and wallets left with none", () => {
    const smart = new SmartWallets();
    smart.credit("T1", grad("C1", NOW - 40 * DAY), ["W"]);
    smart.credit("T2", grad("C2", NOW - DAY), ["W"]);
    smart.credit("T3", grad("C3", NOW), ["W"]);
    smart.refresh(NOW - 15 * DAY + 1);
    expect(smart.count(["W"])).toBe(1);
    smart.refresh(NOW);
    expect(smart.count(["W"])).toBe(0);
    smart.refresh(NOW + SMART_WINDOW + 1);
    expect(smart.stats()).toEqual({ wallets: 0, graduates: 0, smart: 0 });
  });

  it("forgets, on a restart, graduates that credited nobody, so they can be judged again", () => {
    const smart = new SmartWallets();
    smart.credit("T1", grad("C1"), ["W"]);
    smart.credit("T2", grad("C2"), []);
    const back = new SmartWallets();
    back.restore(JSON.parse(JSON.stringify(smart.toJSON())), NOW);
    expect([back.hasGraduate("T1"), back.hasGraduate("T2")]).toEqual([true, false]);
  });

  it("survives a restart, and skips anything malformed", () => {
    const smart = new SmartWallets();
    ["C1", "C2", "C3"].forEach((creator, i) => smart.credit(`T${i}`, grad(creator), ["W"]));
    const back = new SmartWallets();
    back.restore(JSON.parse(JSON.stringify(smart.toJSON())), NOW);
    expect(back.count(["W"])).toBe(1);
    back.restore({ graduates: { T8: { chain: "eth", creator: "C", at: NOW }, T9: null }, credits: { W: "T8", V: ["T9", 5] } }, NOW);
    expect(back.stats()).toEqual({ wallets: 0, graduates: 0, smart: 0 });
    back.restore(undefined, NOW);
    expect(back.stats().graduates).toBe(0);
  });
});

describe("smart money sweep", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A graduate `hours` before NOW, valued `capAt` when it graduated and `cap` now. */
  function graduate(hours: number, capAt: number, cap: number, over: Partial<TrackedToken> = {}): TrackedToken {
    const at = NOW - hours * HOUR;
    return tracked({ graduated: true, graduatedAt: at, mcapSeries: [[at - MIN, capAt]], marketCap: cap, marketAt: NOW, ...over });
  }

  it("judges whether a graduate held up: half its graduation value, and at least $10K", () => {
    expect(capAtGraduation(graduate(7, 40_000, 30_000))).toBe(40_000);
    expect(heldUp(graduate(7, 40_000, 30_000))).toBe(true);
    expect(heldUp(graduate(7, 40_000, 15_000))).toBe(false);
    expect(heldUp(graduate(7, 12_000, 9_000))).toBe(false);
    // The bundles that showed up at first: graduated, then dumped to dust.
    expect(heldUp(graduate(7, 45_000, 49))).toBe(false);
  });

  it("reads Solana graduates' largest wallets as they graduate, two a minute, then a missed one that held up", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const { method } = JSON.parse(init.body) as { method: string };
      const result =
        method === "getTokenLargestAccounts"
          ? { value: fixture.tokenAccounts.map((t) => ({ address: t.account, amount: "1000" })) }
          : { value: fixture.tokenAccounts.map((t) => ({ data: { parsed: { info: { owner: t.owner } } } })) };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: method, result }));
    });
    const store = new TokenStore();
    const recent = [1, 2, 3].map((h) => graduate(h, 40_000, 40_000, { supply: 10_000 }));
    const old = graduate(7, 40_000, 40_000, { supply: 10_000 });
    [...recent, old].forEach((t) => store.add(t));
    const smart = new SmartWallets();
    expect(snapshotsDue(store.all(), smart, NOW)).toEqual(recent);
    let calls = 0;
    const money = createSmartMoney({ store, smart, heliusApiKey: "key", onHeliusCall: () => calls++, fail: () => {} });
    await money.sweep(NOW);
    expect(GRADUATE_CHECKS_PER_MINUTE).toBe(2);
    expect(calls).toBe(4);
    expect(recent.map((t) => t.graduationWallets?.length ?? null)).toEqual([5, 5, null]);
    expect(recent[0].topWallets).toHaveLength(5);
    // Nothing is credited before six hours; the missed graduate waits for a lookup rather than credit nobody.
    expect(smart.stats().graduates).toBe(0);
    await money.sweep(NOW + MIN);
    expect(calls).toBe(8);
    expect(recent[2].graduationWallets).toHaveLength(5);
    expect(smart.hasGraduate(old.address)).toBe(true);
    expect(Object.keys(smart.toJSON().credits)).toHaveLength(5);
  });

  it("credits wallets six hours to a day after graduation, only for graduates that held up", async () => {
    const store = new TokenStore();
    const solid = graduate(7, 40_000, 30_000, { graduationWallets: ["W1", "W2"] });
    const dumped = graduate(7, 45_000, 49, { graduationWallets: ["B1"] });
    const young = graduate(2, 40_000, 40_000, { graduationWallets: ["Y1"] });
    const stale = graduate(30, 40_000, 40_000, { graduationWallets: ["S1"] });
    const pons = ponsToken("0xcreator", { graduated: true, graduatedAt: NOW - 8 * HOUR, mcapSeries: [[NOW - 8 * HOUR, 30_000]], marketCap: 25_000, marketAt: NOW });
    pons.pons!.earlyBuyers = ["0xcreator", "0xa", "0xb"];
    [solid, dumped, young, stale, pons].forEach((t) => store.add(t));
    const smart = new SmartWallets();
    expect(creditsDue(store.all(), smart, NOW)).toEqual([solid, dumped, pons]);
    await createSmartMoney({ store, smart, heliusApiKey: null, onHeliusCall: () => {}, fail: () => {} }).sweep(NOW);
    expect(smart.toJSON().credits).toEqual({ W1: [solid.address], W2: [solid.address], "0xa": [pons.address], "0xb": [pons.address] });
    expect(smart.hasGraduate(dumped.address)).toBe(true);
  });

  it("counts smart wallets on the tokens they hold", async () => {
    const store = new TokenStore();
    const pons = ponsToken("0xcreator", { graduated: true, graduatedAt: NOW - 8 * HOUR, marketCap: 25_000, marketAt: NOW });
    pons.pons!.earlyBuyers = ["0xcreator", "0xa"];
    const live = ponsToken("0xother");
    trackHolders(live.pons!, { buy: true, trader: "0xa", recipient: "0xa", tokens: 1_000 });
    const solana = tracked({ topWallets: ["0xa", "W1"] });
    [pons, live, solana].forEach((t) => store.add(t));
    const smart = new SmartWallets();
    smart.credit("P1", { chain: "rh", creator: "0xc1", at: NOW }, ["0xa"]);
    smart.credit("P2", { chain: "rh", creator: "0xc2", at: NOW }, ["0xa"]);
    await createSmartMoney({ store, smart, heliusApiKey: null, onHeliusCall: () => {}, fail: () => {} }).sweep(NOW);
    expect(smart.toJSON().credits).not.toHaveProperty("0xcreator");
    expect([live.smartCount, solana.smartCount]).toEqual([1, 1]);
    // A graduated Pons token trades on Uniswap, out of the curve's sight, until Blockscout checks it.
    expect(walletsOf(pons)).toEqual([]);
    expect(pons.smartCount).toBe(0);
  });
});
