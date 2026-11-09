import { describe, expect, it } from "vitest";
import { TOKENS } from "@/shared/data/mock-tokens";
import { getTokenData } from "../data/get-token-data";

describe("token crew rewards", () => {
  it.each(["SCAT", "MOON"])("does not show holder payouts for %s outside Tonkpad", async (ticker) => {
    const detail = await getTokenData(ticker);
    expect(detail).not.toBeNull();
    expect(detail?.crew).toBeNull();
    expect(detail?.holders.length).toBeGreaterThan(0);
    expect(detail?.holders.every((holder) => holder.crewEarned === null)).toBe(true);
  });

  it("uses BOLT's 1% crew share for its holder payouts", async () => {
    const detail = await getTokenData("BOLT");
    expect(detail?.crew?.sharePct).toBe(1);
    expect(detail?.holders[0].crewEarned).toBeCloseTo(64.6);
    expect(detail?.holders[1].crewEarned).toBeCloseTo(49.4);
  });

  it("keeps holders without crew rewards unpaid on every mock token", async () => {
    for (const token of TOKENS.filter((token) => !token.flags.crew)) {
      const detail = await getTokenData(token.ticker);
      expect(detail?.crew).toBeNull();
      expect(detail?.holders.every((holder) => holder.crewEarned === null)).toBe(true);
    }
  });
});
