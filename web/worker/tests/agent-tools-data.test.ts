// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { MissionLockJson } from "@/shared/tonk/mission";
import { createAgentData } from "../src/telegram/agent/data";
import { runTool } from "../src/telegram/agent/tools";
import type { TrackedToken } from "../src/model";
import { TokenStore } from "../src/store";
import { toToken } from "../src/tokens";
import { createViews } from "../src/views/cache";
import { FIGURES } from "./agent-answer-fixtures";
import { NOW, tracked, windows } from "./fixtures";
import { launch, WHOA } from "./telegram-fixtures";

const DAY = 86_400;
const NOW_S = Math.floor(NOW / 1000);
const CREATOR = "0xc0ffee0000000000000000000000000000000000";
const MAY_19 = Date.UTC(2027, 4, 19) / 1000;
const lock = (overrides: Partial<MissionLockJson> = {}): MissionLockJson => ({
  type: "time", lockedBps: 10_000, start: NOW_S - 60, end: MAY_19, total: "50000000000000000000000000", claimed: "0", checkpoint: "0", ...overrides,
});

function storeWith(...tokens: TrackedToken[]): TokenStore {
  const store = new TokenStore();
  for (const t of tokens) store.add(t);
  return store;
}

const dataFor = (store: TokenStore, brandCreators: string[] = []) =>
  createAgentData({ store, figures: async () => FIGURES, brandCreators: new Set(brandCreators), now: () => NOW });

/** A tonkfun.fun launch priced by its feed: $21.4K, up 12.44% in a day, 41% of its curve sold, 37 holders. */
function priced(name = "Whoa the Tarsier", options: { lock?: MissionLockJson | null } = {}): TrackedToken {
  const t = launch(WHOA, { name, lock: options.lock === undefined ? lock() : options.lock });
  return { ...t, marketAt: NOW, marketCap: 21_400, windows: windows({ h24: { change: 12.44 } }), holderCount: 37, curve: 0.41 };
}

describe("createAgentData: a token as get_token returns it", () => {
  it("reads a tonkfun.fun launch from the store, as its card does, with its lock, rewards and shield", () => {
    const t = priced();
    const token = dataFor(storeWith(t)).token(WHOA.toUpperCase().replace("0X", "0x"));
    const card = toToken(t, NOW);
    expect(token).toEqual({
      address: WHOA, name: "Whoa the Tarsier", ticker: "WHOA", nameHidden: false, launchpad: "tonkfun.fun", chain: "Robinhood Chain",
      score: card.score, level: card.level, badges: ["Locked", "Crew 2%", "Block-0 Shield"],
      marketCapUsd: 21_400, change24h: 12.4, curvePct: 41, graduated: false, holders: 37, ageMinutes: 1,
      launch: { lockPct: 100, lockKind: "time", lockEnds: "2027-05-19", claimablePct: 0, crewPct: 2, creatorPct: 0, shield: true },
    });
  });

  it("works out what a vest lets the creator claim now, and reads no lock as none", () => {
    const vest = lock({ type: "linear", lockedBps: 5_000, start: NOW_S - 50 * DAY, end: NOW_S + 50 * DAY, total: "100000000000000000000000000" });
    expect(dataFor(storeWith(priced("Whoa", { lock: vest }))).token(WHOA)?.launch).toMatchObject({ lockPct: 50, lockKind: "linear", claimablePct: 50 });
    expect(dataFor(storeWith(priced("Whoa", { lock: null }))).token(WHOA)?.launch).toMatchObject({ lockPct: null, lockKind: "none", lockEnds: null, claimablePct: null });
    const forever = lock({ end: Number.MAX_SAFE_INTEGER });
    expect(dataFor(storeWith(priced("Whoa", { lock: forever }))).token(WHOA)?.launch?.lockEnds).toBeNull();
  });

  it("reads other launchpads' tokens too, without market figures before the market has any", () => {
    const pump = tracked({ name: "Pepe", symbol: "PEPE" });
    const token = dataFor(storeWith(pump)).token(pump.address);
    expect(token).toMatchObject({ address: pump.address, name: "Pepe", launchpad: "Pump.fun", chain: "Solana", marketCapUsd: null, change24h: null, launch: null });
    expect(dataFor(storeWith(pump)).token(pump.address.toLowerCase())).toBeNull();
  });

  it("holds no wallet, metadata text, agent brief or art", async () => {
    const base = priced();
    const tonk = base.tonk ? { ...base.tonk, balances: { [CREATOR]: "1", "0x2222222222222222222222222222222222222222": "2" } } : undefined;
    const t: TrackedToken = { ...base, image: "https://img.tonkfun.fun/a.webp", tonk };
    const data = dataFor(storeWith(t));
    expect(Object.keys(data.token(WHOA) ?? {}).sort()).toEqual(
      ["address", "ageMinutes", "badges", "chain", "change24h", "curvePct", "graduated", "holders", "launch", "launchpad", "level", "marketCapUsd", "name", "nameHidden", "score", "ticker"].sort(),
    );
    const run = await runTool("get_token", { address: WHOA }, data, new Set([WHOA]));
    expect(run.content).not.toMatch(/0xc0ffee|0x2222|img\.tonkfun|webp/i);
    expect(Object.keys(JSON.parse(run.content))).not.toEqual(expect.arrayContaining(["creator"]));
  });

  it("never marks a token opened, and changes nothing in the store", () => {
    const t = priced();
    const store = storeWith(t);
    const views = createViews(store, { solUsd: null, ethUsd: 3_000, rhGasGwei: null }, []);
    const before = JSON.stringify(store.toJSON());
    const writes = (["add", "addLaunch", "remove", "markGraduated", "applyMarket", "applyAsset", "prune", "restore"] as const).map((m) => vi.spyOn(store, m));
    const token = vi.spyOn(views, "token");
    expect(dataFor(store).token(WHOA)).not.toBeNull();
    expect(views.openedAddresses().size).toBe(0);
    expect(token).not.toHaveBeenCalled();
    for (const write of writes) expect(write).not.toHaveBeenCalled();
    expect(JSON.stringify(store.toJSON())).toBe(before);
  });

  it("is null for a token it doesn't follow or a store that fails, and passes the figures through", async () => {
    expect(dataFor(storeWith()).token(WHOA)).toBeNull();
    const broken = { all: () => { throw new Error("store down"); } } as unknown as TokenStore;
    expect(dataFor(broken).token(WHOA)).toBeNull();
    expect(await dataFor(storeWith()).figures()).toEqual(FIGURES);
    const failing = createAgentData({ store: storeWith(), figures: () => Promise.reject(new Error("site down")), brandCreators: new Set(), now: () => NOW });
    expect(await failing.figures()).toBeNull();
  });
});

describe("createAgentData: hidden names", () => {
  const read = (name: string, symbol = "WHOA", creators: string[] = []) => dataFor(storeWith({ ...priced(name), symbol }), creators).token(WHOA);

  it("hides a name that uses the brand, unless its creator is one the owner named", () => {
    for (const [name, symbol] of [["TonkFun Gold", "GOLD"], ["Gold", "TONK"], ["Τοnk Official", "TO"]]) expect(read(name, symbol)).toMatchObject({ name: "[name hidden]", ticker: "", nameHidden: true });
    expect(read("TonkFun Gold", "GOLD", [CREATOR])).toMatchObject({ name: "TonkFun Gold", ticker: "GOLD", nameHidden: false });
    expect(read("STONKS", "STONKS")).toMatchObject({ name: "STONKS", nameHidden: false });
  });

  it("hides a link or a handle however it is written, and airdrop, claim, reward or support bait", () => {
    const risky = ["claim.evil.xyz", "evil·xyz coin", "t.me/whoa_support", "visit https://evil.example", "@whoa_admin", "Free Airdrop", "Claim Rewards", "WhoaSupport", "空投 WHOA", "Whoa Bonus Drop"];
    for (const name of risky) expect(read(name), name).toMatchObject({ name: "[name hidden]", nameHidden: true });
    expect(read("Whoa", "AIRDROP")).toMatchObject({ nameHidden: true });
    expect(read("Tonk Support", "TS", [CREATOR])).toMatchObject({ nameHidden: true });
  });

  it("keeps an ordinary name, cleaned as the cards clean it", () => {
    expect(read("Whoa the Tarsier")).toMatchObject({ name: "Whoa the Tarsier", nameHidden: false });
    expect(read("Pump.fun Cat")).toMatchObject({ name: "Pump·fun Cat", nameHidden: false });
    const long = read("A very long token name that goes on and on and on")?.name ?? "";
    expect([...long].length).toBeLessThanOrEqual(40);
    expect(long.endsWith("…")).toBe(true);
  });

  it("never lets a hidden name reach the model", async () => {
    const run = await runTool("get_token", { address: WHOA }, dataFor(storeWith(priced("claim.evil.xyz"))), new Set([WHOA]));
    expect(run.content).not.toMatch(/evil|claim\W/i);
    expect(JSON.parse(run.content).untrusted_creator_text).toMatchObject({ name: "[name hidden]", ticker: "" });
  });
});
