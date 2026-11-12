import { afterEach, describe, expect, it, vi } from "vitest";
import { runCheck } from "@/shared/alerts/engine";
import { addRule, removeRule } from "@/shared/alerts/hooks";
import {
  FEED_KEY,
  MAX_FEED,
  MAX_RULES,
  MAX_TEXT,
  readFeed,
  readRules,
  readSeen,
  readSettings,
  RULES_KEY,
  SETTINGS_KEY,
  writeFeed,
  writeRules,
  writeSettings,
} from "@/shared/alerts/storage";
import type { AlertRule, FeedItem } from "@/shared/alerts/types";
import { WATCHLIST_KEY } from "@/shared/lib/watchlist";
import type { LiveLaunch, LivePrice } from "@/shared/types/live";

const TOKEN = { address: "PEPE", chain: "sol" as const, symbol: "PEPE", name: "Pepe" };
const rule = (id: string, value = 2): AlertRule => ({ id, token: TOKEN, on: true, armed: true, createdAt: 1, kind: "price", direction: "above", value });
const price = (priceUsd: number): LivePrice => ({ address: "PEPE", chain: "sol", symbol: "PEPE", name: "Pepe", priceUsd, marketCap: 1e6, change1h: 0, change24h: 0, at: 1 });

afterEach(() => localStorage.clear());

describe("alert storage", () => {
  it("drops what doesn't parse or isn't in shape, and bounds chain text", () => {
    localStorage.setItem(RULES_KEY, "{not json");
    expect(readRules()).toEqual([]);
    localStorage.setItem(RULES_KEY, JSON.stringify([rule("ok"), { id: "bad", kind: "price" }, { ...rule("neg"), value: -1 }, { ...rule("long"), token: { ...TOKEN, symbol: "X".repeat(500) } }]));
    expect(readRules().map((r) => r.id)).toEqual(["ok", "long"]);
    expect(readRules()[1].token.symbol).toHaveLength(MAX_TEXT);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ launches: "yes", notify: true }));
    expect(readSettings()).toEqual({ launches: false, graduations: false, locks: false, notify: true });
  });

  it("keeps at most 25 rules and the last 100 feed items", () => {
    writeRules(Array.from({ length: 30 }, (_, i) => rule(`r${i}`)));
    expect(readRules()).toHaveLength(MAX_RULES);
    expect(addRule(rule("extra"))).toBe(false);
    removeRule("r0");
    expect(addRule(rule("extra"))).toBe(true);
    expect(readRules()[0].id).toBe("extra");
    const item = (i: number): FeedItem => ({ id: `f${i}`, at: i, kind: "priceAbove", token: TOKEN, value: 2, read: false });
    writeFeed(Array.from({ length: 120 }, (_, i) => item(i)));
    expect(readFeed()).toHaveLength(MAX_FEED);
  });
});

describe("a round of checks", () => {
  it("fires a crossed level once, into the feed, and keeps it quiet until it re-arms", async () => {
    writeRules([rule("a"), { ...rule("off"), on: false }]);
    const fetchPrices = vi.fn(async () => [price(2.5)]);
    const deps = { fetchPrices, fetchLaunches: null, now: () => 1_000 };
    const first = await runCheck(deps);
    expect(first.map((i) => [i.kind, i.value, i.read])).toEqual([["priceAbove", 2, false]]);
    expect(fetchPrices).toHaveBeenCalledWith(["PEPE"]);
    expect(readRules().find((r) => r.id === "a")?.armed).toBe(false);
    expect(await runCheck(deps)).toEqual([]);
    expect(readFeed()).toHaveLength(1);
  });

  it("never brings back a rule deleted while prices were on their way", async () => {
    writeRules([rule("a"), rule("b", 3)]);
    const deps = {
      fetchPrices: async () => {
        removeRule("b");
        return [price(2.5)];
      },
      fetchLaunches: null,
      now: () => 1_000,
    };
    await runCheck(deps);
    expect(readRules().map((r) => r.id)).toEqual(["a"]);
  });

  it("checks the launchpad only with a switch on, asking about watched EVM tokens", async () => {
    const launches: LiveLaunch[] = [{ address: "0x00000000000000000000000000000000000000a1", symbol: "A1", name: "A", launchedAt: 5, graduatedAt: null, lockEnd: null, lockClaimed: null }];
    const fetchLaunches = vi.fn(async () => launches);
    const deps = { fetchPrices: async () => [], fetchLaunches, now: () => 10 };
    await runCheck(deps);
    expect(fetchLaunches).not.toHaveBeenCalled();
    writeSettings({ ...readSettings(), launches: true });
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(["PEPE", launches[0].address]));
    await runCheck(deps);
    expect(fetchLaunches).toHaveBeenCalledWith([launches[0].address]);
    expect(readSeen()?.newest).toBe(5);
    expect(localStorage.getItem(FEED_KEY)).toBeNull();
  });
});
