// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { LiveList, LiveListQuery } from "@/shared/types/live";
import { parseListQuery, tokenMatches } from "../src/server";
import { listView, MAX_LIMIT } from "../src/views/list";
import { overviewView, pct, radarBlips } from "../src/views/overview";
import { shellView } from "../src/views/shell";
import { address, HOUR, MIN, NOW, priced, tracked } from "./fixtures";

const query = (over: Partial<LiveListQuery> = {}): LiveListQuery => ({ chain: "all", pad: "all", tab: "trending", tf: "24h", q: "", limit: 10, ...over });
const ids = (list: LiveList) => list.rows.map((t) => t.address);

describe("listView", () => {
  const big = priced(90_000, { h1: { volume: 9_000, change: 5 }, h24: { volume: 50_000, change: 20 } }, { name: "Ghosty" });
  const busy = priced(20_000, { h1: { volume: 100, change: 50 }, h24: { volume: 80_000, change: 300 } }, { launchpad: "bonk" });
  const dust = priced(3_000, { h24: { volume: 900_000 } });
  const unpriced = tracked({ marketCap: 50_000 }, 5 * MIN);
  const all = [big, busy, dust, unpriced];

  it("trending: priced tokens over the dust line, busiest first for the timeframe", () => {
    expect(ids(listView(all, query(), NOW))).toEqual([busy.address, big.address]);
    expect(ids(listView(all, query({ tf: "1h" }), NOW))).toEqual([big.address, busy.address]);
  });

  it("filters by launchpad and chain, and searches names, tickers and addresses", () => {
    expect(ids(listView(all, query({ pad: "bonk" }), NOW))).toEqual([busy.address]);
    expect(ids(listView(all, query({ chain: "rh" }), NOW))).toEqual([]);
    expect(ids(listView(all, query({ q: "ghost" }), NOW))).toEqual([big.address]);
    expect(ids(listView(all, query({ q: busy.symbol.toLowerCase() }), NOW))).toEqual([busy.address]);
    expect(ids(listView(all, query({ q: big.address }), NOW))).toEqual([big.address]);
  });

  it("new pairs: the last hour, newest first", () => {
    const fresh = tracked({}, 2 * MIN);
    const old = tracked({}, 2 * HOUR);
    expect(ids(listView([old, big, fresh], query({ tab: "new" }), NOW))).toEqual([fresh.address, big.address]);
  });

  it("graduating, graduated and gainers", () => {
    const nearly = tracked({ curve: 0.8 });
    const half = tracked({ curve: 0.5 });
    const low = tracked({ curve: 0.2 });
    const graduate = tracked({ graduated: true, graduatedAt: NOW - HOUR, curve: 1 });
    const tokens = [low, half, nearly, graduate, big, busy];
    expect(ids(listView(tokens, query({ tab: "graduating" }), NOW))).toEqual([nearly.address, half.address]);
    expect(ids(listView(tokens, query({ tab: "graduated" }), NOW))).toEqual([graduate.address]);
    expect(ids(listView(tokens, query({ tab: "gainers" }), NOW))).toEqual([busy.address, big.address]);
  });

  it("smart money: tokens smart wallets hold, the most first; locked missions are still empty", () => {
    const one = priced(40_000, { h24: { volume: 9_000 } }, { smartCount: 1 });
    const three = priced(10_000, { h24: { volume: 100 } }, { smartCount: 3 });
    const oneBusier = priced(30_000, { h24: { volume: 70_000 } }, { smartCount: 1 });
    const rows = listView([...all, one, three, oneBusier], query({ tab: "smart" }), NOW).rows;
    expect(rows.map((t) => t.address)).toEqual([three.address, oneBusier.address, one.address]);
    expect(rows[0].smartWallets).toBe(3);
    expect(listView(all, query({ tab: "locked" }), NOW).rows).toEqual([]);
  });

  it("pages within 1–50 rows and counts every match and today's launches", () => {
    const many = Array.from({ length: 60 }, (_, i) => priced(10_000 + i, { h24: { volume: 1_000 + i } }));
    const page = listView(many, query({ limit: 500 }), NOW);
    expect(page.rows).toHaveLength(MAX_LIMIT);
    expect(page).toMatchObject({ matched: 60, total: 60, updatedAt: NOW });
    expect(listView(many, query({ limit: 0 }), NOW).rows).toHaveLength(1);
  });

  it("gives the flame to tokens with 20+ buys in 15 minutes", () => {
    const hot = priced(12_000, { h24: { volume: 5_000, buys: 25 } }, {}, 10 * MIN);
    expect(listView([hot, big], query(), NOW).rows.map((t) => t.flags.hot)).toEqual([false, true]);
  });
});

describe("overviewView", () => {
  const pick = priced(30_000, { h24: { buys: 50, volume: 20_000 } }, { mintRevoked: true, freezeRevoked: true }, 12 * MIN);
  const faster = priced(12_000, { h24: { buys: 80, volume: 9_000 } }, {}, 5 * MIN);
  const graduate = priced(70_000, { h24: { volume: 40_000 } }, { graduated: true, graduatedAt: NOW - HOUR, curve: 1 }, 3 * HOUR);
  const heaven = tracked({ launchpad: "heaven" }, 2 * MIN);
  const yesterday = tracked({}, 30 * HOUR);
  const view = overviewView([pick, faster, graduate, heaven, yesterday], ["pump", "bonk"], NOW);

  it("counts today's launches, volume and graduations", () => {
    expect(view.stats).toEqual([
      { id: "tokensToday", value: 4, kind: "count" },
      { id: "volume24h", value: 69_000, kind: "usd" },
      { id: "launched5m", value: 2, kind: "count" },
      { id: "graduatedToday", value: 1, kind: "count" },
    ]);
    expect(view.chainCounts).toEqual({ all: 4, sol: 4, rh: 0 });
  });

  it("ranks Heating up by buy velocity and picks the first with a decent score", () => {
    expect(view.heating.map((c) => c.token.address)).toEqual([faster.address, pick.address]);
    expect(view.heating.every((c) => /^#[0-9A-F]{6}$/.test(c.color))).toBe(true);
    expect(view.missionPick?.token.address).toBe(pick.address);
  });

  it("shows the design's launchpad chips and counts the rest as more", () => {
    expect(view.launchpads.map((c) => c.id)).toEqual(["all", "tonk", "pons", "pump", "bonk", "bags", "moon"]);
    expect(view.launchpads.find((c) => c.id === "pump")?.count).toBe(3);
    expect(view.moreLaunchpads).toBe(1);
    expect(view.scope).toEqual({ pads: ["Pump.fun", "Bonk.fun"], more: 0 });
  });
});

describe("radarBlips", () => {
  it("places up to seven tokens in the design's slots, each only once", () => {
    const hot = [0, 1, 2].map((i) => priced(30_000, { h1: { change: i === 1 ? -12.6 : 412.4 }, h24: { buys: 9 } }, {}, 40 * MIN));
    const fresh = [1, 2, 3, 4].map((m) => priced(5_000, { h24: { buys: 3 } }, {}, m * MIN));
    const graduating = [0.9, 0.7, 0.65].map((curve) => priced(40_000, {}, { curve }, 2 * HOUR));
    const blips = radarBlips([...hot, ...fresh, ...graduating], hot, NOW);

    expect(blips.map((b) => b.address)).toEqual([
      hot[0].address,
      hot[1].address,
      fresh[0].address,
      fresh[1].address,
      fresh[2].address,
      graduating[0].address,
      graduating[1].address,
    ]);
    expect(blips.slice(0, 2).map((b) => [b.angle, b.distance, b.size, b.label, b.labelSide])).toEqual([
      [-64, 0.6, 36, "+412%", "right"],
      [200, 0.5, 30, "−13%", "left"],
    ]);
    expect(blips.slice(2).every((b) => b.label === null && b.labelSide === null)).toBe(true);
    expect(new Set(blips.map((b) => `${b.angle},${b.distance}`)).size).toBe(7);
  });
});

describe("pct", () => {
  it("labels whole-percent changes without a signed zero", () => {
    expect([pct(412.4), pct(-12.6), pct(-0.2), pct(0.4), pct(0)]).toEqual(["+412%", "−13%", "0%", "0%", "0%"]);
  });
});

describe("shellView", () => {
  it("tapes the eight busiest tokens of the last hour", () => {
    const tokens = Array.from({ length: 10 }, (_, i) => priced(6_000, { h1: { volume: (i + 1) * 100 } }));
    const shell = shellView([...tokens, priced(4_000, { h1: { volume: 99_999 } })], { solUsd: 90, ethUsd: null, rhGasGwei: 0.02 }, NOW);
    expect(shell.tape.map((t) => t.address)).toEqual(tokens.slice(2).reverse().map((t) => t.address));
    expect(shell.status).toEqual({ solUsd: 90, ethUsd: null, rhGasGwei: 0.02 });
  });
});

describe("parseListQuery", () => {
  it("falls back to the defaults for anything unknown", () => {
    expect(parseListQuery(new URLSearchParams("chain=eth&pad=x&tab=hot&tf=2h&limit=abc"))).toEqual(query());
  });

  it("reads a full view and caps the search", () => {
    const params = new URLSearchParams({ chain: "sol", pad: "bonk", tab: "new", tf: "5m", q: "x".repeat(80), limit: "20" });
    expect(parseListQuery(params)).toEqual({ chain: "sol", pad: "bonk", tab: "new", tf: "5m", q: "x".repeat(64), limit: 20 });
    expect(address("a")).toHaveLength(44);
  });
});

describe("tokenMatches", () => {
  it("accepts only the exact worker token", () => {
    expect(tokenMatches("s3cret-token", "s3cret-token")).toBe(true);
    expect(tokenMatches("s3cret-tokeN", "s3cret-token")).toBe(false);
    expect(tokenMatches("", "s3cret-token")).toBe(false);
    expect(tokenMatches(undefined, "s3cret-token")).toBe(false);
    expect(tokenMatches(["s3cret-token"], "s3cret-token")).toBe(false);
  });
});
