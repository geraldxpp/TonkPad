import { describe, expect, it } from "vitest";
import { checkRule, diffLaunches, levelValid, type Quote } from "@/shared/alerts/check";
import { DEFAULT_SETTINGS } from "@/shared/alerts/storage";
import type { AlertRule, LaunchSeen } from "@/shared/alerts/types";
import type { LiveLaunch } from "@/shared/types/live";

const TOKEN = { address: "PEPE", chain: "sol" as const, symbol: "PEPE", name: "Pepe" };
const quote = (patch: Partial<Quote>): Quote => ({ priceUsd: 1, marketCap: 1_000_000, change1h: 0, change24h: 0, ...patch });
const level = (patch: Partial<Extract<AlertRule, { kind: "price" | "mcap" }>> = {}): AlertRule => ({
  id: "r1", token: TOKEN, on: true, armed: true, createdAt: 0, kind: "price", direction: "above", value: 2, ...patch,
});
const move = (patch: Partial<Extract<AlertRule, { kind: "move" }>> = {}): AlertRule => ({
  id: "r2", token: TOKEN, on: true, armed: true, createdAt: 0, kind: "move", window: "1h", percent: 20, ...patch,
});

/** Runs a rule through a series of quotes, carrying its armed state, and returns what fired. */
function run(rule: AlertRule, quotes: Quote[]) {
  let current = rule;
  const fired: string[] = [];
  for (const q of quotes) {
    const result = checkRule(current, q);
    if (result.fired) fired.push(`${result.fired.kind}:${result.fired.value}`);
    current = { ...current, armed: result.armed };
  }
  return fired;
}

describe("alert rules", () => {
  it("fires a level once on crossing, both ways, and on price or market cap", () => {
    expect(run(level(), [quote({ priceUsd: 1.5 }), quote({ priceUsd: 2 }), quote({ priceUsd: 2.4 })])).toEqual(["priceAbove:2"]);
    expect(run(level({ direction: "below", value: 0.5 }), [quote({ priceUsd: 0.6 }), quote({ priceUsd: 0.49 })])).toEqual(["priceBelow:0.5"]);
    expect(run(level({ kind: "mcap", value: 2_000_000 }), [quote({ marketCap: 2_500_000 })])).toEqual(["mcapAbove:2000000"]);
  });

  it("re-arms only once the figure is back past the line by 1%, so hovering doesn't fire again", () => {
    const hovering = [quote({ priceUsd: 2.01 }), quote({ priceUsd: 1.995 }), quote({ priceUsd: 2.02 })];
    expect(run(level(), hovering)).toEqual(["priceAbove:2"]);
    const back = [quote({ priceUsd: 2.01 }), quote({ priceUsd: 1.97 }), quote({ priceUsd: 2.05 })];
    expect(run(level(), back)).toEqual(["priceAbove:2", "priceAbove:2"]);
  });

  it("fires a move either way within its own window, and re-arms once it eases", () => {
    expect(run(move(), [quote({ change1h: -25, change24h: 3 })])).toEqual(["moveDown:25"]);
    expect(run(move({ window: "24h" }), [quote({ change1h: 50, change24h: 10 }), quote({ change24h: 31.26 })])).toEqual(["moveUp:31.3"]);
    expect(run(move(), [quote({ change1h: 21 }), quote({ change1h: 18 }), quote({ change1h: 22 }), quote({ change1h: 15 }), quote({ change1h: 24 })])).toEqual(["moveUp:21", "moveUp:24"]);
  });

  it("only accepts a level on the far side of the figure now", () => {
    expect(levelValid("above", 2, 1)).toBe(true);
    expect(levelValid("above", 1, 1)).toBe(false);
    expect(levelValid("below", 0.5, 1)).toBe(true);
    expect(levelValid("below", -1, 1)).toBe(false);
    expect(levelValid("above", Number.NaN, 1)).toBe(false);
  });
});

const NOW = Date.UTC(2026, 10, 12, 12);
const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b2";
const launch = (address: string, patch: Partial<LiveLaunch> = {}): LiveLaunch => ({
  address, symbol: address.slice(-2).toUpperCase(), name: "Mission", launchedAt: NOW - 3_600_000, graduatedAt: null, lockEnd: NOW + 86_400_000, lockClaimed: "0", ...patch,
});
const ALL = { ...DEFAULT_SETTINGS, launches: true, graduations: true, locks: true };

describe("launchpad alerts", () => {
  it("only records on the first check, so switching on never floods the feed", () => {
    const first = diffLaunches(null, [launch(A), launch(B)], ALL, [A, B], NOW);
    expect(first.drafts).toEqual([]);
    expect(first.seen.newest).toBe(NOW - 3_600_000);
  });

  it("reports a new launch, and for watched tokens a graduation, a claim, an extension and a lock ending", () => {
    const seen: LaunchSeen = diffLaunches(null, [launch(A), launch(B, { lockEnd: NOW + 30_000 })], ALL, [A, B], NOW).seen;
    const C = "0x00000000000000000000000000000000000000c3";
    const later = NOW + 60_000;
    const next = [
      launch(A, { graduatedAt: later, lockEnd: NOW + 172_800_000, lockClaimed: "5" }),
      launch(B, { lockEnd: NOW + 30_000 }),
      launch(C, { launchedAt: later }),
    ];
    const kinds = diffLaunches(seen, next, ALL, [A.toUpperCase().replace("0X", "0x"), B], later).drafts.map((d) => `${d.kind}:${d.token.symbol}`);
    expect(kinds).toEqual(["graduated:A1", "extended:A1", "claimed:A1", "unlocked:B2", "launch:C3"]);
  });

  it("says nothing about tokens nobody watches, or kinds switched off", () => {
    const seen = diffLaunches(null, [launch(A)], ALL, [], NOW).seen;
    const changed = [launch(A, { graduatedAt: NOW + 1 })];
    expect(diffLaunches(seen, changed, ALL, [], NOW + 2).drafts).toEqual([]);
    expect(diffLaunches(seen, changed, { ...ALL, graduations: false }, [A], NOW + 2).drafts).toEqual([]);
    expect(diffLaunches(seen, [launch(B, { launchedAt: NOW })], { ...ALL, launches: false }, [], NOW + 2).drafts).toEqual([]);
  });
});
