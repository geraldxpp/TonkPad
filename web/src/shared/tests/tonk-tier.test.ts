import { describe, expect, it } from "vitest";
import { effectiveTier, type LockSettings, MIN_LOCKED_FOR_TIER } from "@/shared/tonk/rules";

const WEI = BigInt(10) ** BigInt(18);
const IRONCLAD: LockSettings = { type: "time", sharePct: 80, days: 90 };
const STANDARD: LockSettings = { type: "linear", sharePct: 50, days: 30 };

describe("a lock's tier, as the mainnet contract rules (review finding M-2)", () => {
  it("is 10M tokens: 1% of the 1B supply", () => {
    expect(MIN_LOCKED_FOR_TIER).toBe(BigInt(10_000_000) * WEI);
  });

  it("unlocks its tier only from exactly 1% of supply locked", () => {
    // 80% of 12.5M is exactly 10M: the boundary is accepted, one token-wei under it isn't.
    const exact = BigInt(12_500_000) * WEI;
    expect(effectiveTier(true, IRONCLAD, exact)).toBe("ironclad");
    expect(effectiveTier(true, IRONCLAD, exact - BigInt(2))).toBe("none");
    expect(effectiveTier(true, STANDARD, BigInt(20_000_000) * WEI)).toBe("standard");
    expect(effectiveTier(true, STANDARD, BigInt(19_999_999) * WEI)).toBe("none");
  });

  it("never lifts a lock above its own tier, and needs a dev buy", () => {
    expect(effectiveTier(true, { type: "time", sharePct: 50, days: 20 }, BigInt(500_000_000) * WEI)).toBe("none");
    expect(effectiveTier(false, IRONCLAD, BigInt(500_000_000) * WEI)).toBe("none");
    expect(effectiveTier(true, { type: "none", sharePct: 0, days: 0 }, BigInt(500_000_000) * WEI)).toBe("none");
  });
});
