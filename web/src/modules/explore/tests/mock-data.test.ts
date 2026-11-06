import { describe, expect, it } from "vitest";
import { formatAge, formatChange, formatInteger, formatUsdCompact } from "@/shared/lib/format";
import { TOKENS } from "../data/explore.mock";
import { getExploreData } from "../data/get-explore-data";

/** The reference's DATA rows: tick, chg, vol, holders, mcap, age. */
const REFERENCE: Array<[string, string, string, string, string, string]> = [
  ["GHOST", "+412.6%", "$186K", "1,204", "$58.2K", "18d"],
  ["SCAT", "+96.4%", "$842K", "5,104", "$1.18M", "5d"],
  ["ORB", "+221.0%", "$148K", "988", "$64.1K", "26m"],
  ["MOON", "+38.2%", "$410K", "1,966", "$864K", "2d"],
  ["SHRM", "−12.4%", "$61K", "412", "$37.4K", "1h"],
  ["BOLT", "+64.9%", "$190K", "902", "$276K", "3d"],
  ["LUMEN", "−8.1%", "$18K", "211", "$21.3K", "6h"],
  ["KITE", "+17.3%", "$12K", "158", "$19.0K", "52m"],
  ["MOCHI", "+148.0%", "$9.4K", "97", "$11.6K", "9m"],
  ["TIDE", "+31.5%", "$2.1K", "41", "$7.3K", "4m"],
];

describe("Explore mock data", () => {
  it("keeps the reference order", () => {
    expect(TOKENS.map((t) => t.ticker)).toEqual(REFERENCE.map((r) => r[0]));
  });

  it.each(REFERENCE)("formats %s exactly like the design", (ticker, chg, vol, holders, mcap, age) => {
    const t = TOKENS.find((token) => token.ticker === ticker)!;
    expect(formatChange(t.change24h)).toBe(chg);
    expect(formatUsdCompact(t.volume24h, { trimZeros: true })).toBe(vol);
    expect(formatInteger(t.holders ?? Number.NaN)).toBe(holders);
    expect(formatUsdCompact(t.marketCap)).toBe(mcap);
    expect(formatAge(t.ageMinutes)).toBe(age);
  });

  it("getExploreData resolves the cards, blips and Mission Pick", async () => {
    const data = await getExploreData();
    expect(data.heating.map((c) => [c.token.ticker, c.color])).toEqual([
      ["GHOST", "#24186E"],
      ["SCAT", "#7A2414"],
      ["ORB", "#3A0E6C"],
      ["MOON", "#0C1450"],
      ["SHRM", "#07433C"],
    ]);
    expect(data.blips.map((b) => b.ticker)).toEqual(["GHOST", "ORB", "MOON", "SCAT", "BOLT", "MOCHI", "TIDE"]);
    expect(data.missionPick?.token.name).toBe("Ghosty");
    expect(data.scope).toEqual({ pads: ["Tonkpad", "Pons", "Pump.fun"], more: 5 });
    expect(data.launchpads.map((p) => formatInteger(p.count))).toEqual(["8,412", "1,846", "624", "3,904", "1,022", "512", "304"]);
  });
});
