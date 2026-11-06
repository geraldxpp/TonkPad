import { describe, expect, it } from "vitest";
import { TOKENS } from "../data/explore.mock";
import { filterTokens } from "../lib/filter";
import { DEFAULT_VIEW, type ExploreView } from "../lib/view";

const run = (patch: Partial<ExploreView>) => filterTokens(TOKENS, { ...DEFAULT_VIEW, ...patch });
const names = (patch: Partial<ExploreView>) => run(patch).map((t) => t.name);

describe("filterTokens — counts from the module prompt", () => {
  it("shows all 10 tokens by default", () => {
    expect(run({})).toHaveLength(10);
  });

  it("Locked Missions shows 4", () => {
    expect(names({ tab: "locked" })).toEqual(["Ghosty", "Orbit", "Sparky", "Tide"]);
  });

  it('search "mo" shows 2 (name or ticker, case-insensitive)', () => {
    expect(names({ q: "mo" })).toEqual(["Moonboi", "Mochi"]);
    expect(names({ q: "MO" })).toEqual(["Moonboi", "Mochi"]);
    expect(names({ q: "  mo  " })).toEqual(["Moonboi", "Mochi"]);
  });

  it("Solana shows 5", () => {
    expect(names({ chain: "sol" })).toEqual(["Sol Cat", "Shroomy", "Lumen", "Kite", "Tide"]);
  });

  it("Solana + Pons shows 0 (the empty state)", () => {
    expect(run({ chain: "sol", pad: "pons" })).toEqual([]);
  });

  it("Gainers puts Ghosty first and sorts by 24h change", () => {
    const rows = run({ tab: "gainers" });
    expect(rows[0].name).toBe("Ghosty");
    const changes = rows.map((t) => t.change24h);
    expect(changes).toEqual([...changes].sort((a, b) => b - a));
  });
});

describe("filterTokens — the other tabs", () => {
  it("New pairs = New flag or an age in minutes", () => {
    expect(names({ tab: "new" })).toEqual(["Orbit", "Kite", "Mochi", "Tide"]);
  });

  it("Graduating = on the curve at 50% or more", () => {
    expect(names({ tab: "graduating" })).toEqual(["Ghosty", "Orbit", "Shroomy"]);
  });

  it("Graduated = curve complete", () => {
    expect(names({ tab: "graduated" })).toEqual(["Sol Cat", "Moonboi", "Sparky"]);
  });

  it("Smart money = one or more smart wallets", () => {
    expect(names({ tab: "smart" })).toEqual(["Ghosty", "Sol Cat", "Orbit", "Moonboi", "Sparky", "Mochi"]);
  });

  it("Trending adds no filter", () => {
    expect(run({ tab: "trending" })).toHaveLength(10);
  });
});

describe("filterTokens — combining and ranking", () => {
  it("combines chain AND launchpad AND search AND tab", () => {
    expect(names({ chain: "rh", pad: "tonk", tab: "locked" })).toEqual(["Ghosty", "Orbit", "Sparky"]);
    expect(names({ chain: "rh", pad: "tonk", tab: "locked", q: "or" })).toEqual(["Orbit"]);
  });

  it("restarts ranks at 1 after filtering", () => {
    expect(run({ tab: "locked" }).map((t) => t.rank)).toEqual([1, 2, 3, 4]);
    expect(run({ chain: "sol" })[0]).toMatchObject({ name: "Sol Cat", rank: 1 });
  });

  it("does not reorder or mutate the source list", () => {
    const before = TOKENS.map((t) => t.ticker);
    run({ tab: "gainers" });
    expect(TOKENS.map((t) => t.ticker)).toEqual(before);
  });
});
