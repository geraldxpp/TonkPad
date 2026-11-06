import { afterEach, describe, expect, it } from "vitest";
import {
  formatCountdown,
  lockToSweep,
  resetSweepOrigin,
  secondsToNextSweep,
  sweepOrigin,
} from "../lib/sweep-clock";

afterEach(() => resetSweepOrigin());

describe("secondsToNextSweep", () => {
  it("counts 6 → 1 across one 6 s sweep, then resets", () => {
    const seen = [0, 999, 1000, 2500, 3999, 4000, 5999, 6000, 6001].map((t) => secondsToNextSweep(t, 0));
    expect(seen).toEqual([6, 6, 5, 4, 3, 2, 1, 6, 6]);
  });

  it("measures from the sweep's origin", () => {
    expect(secondsToNextSweep(1138, 138)).toBe(5);
    expect(secondsToNextSweep(100, 138)).toBe(1); // just before the origin
  });
});

describe("formatCountdown", () => {
  it("shows 0:06 … 0:01", () => {
    expect(formatCountdown(6)).toBe("0:06");
    expect(formatCountdown(1)).toBe("0:01");
  });
});

describe("lockToSweep", () => {
  it("pins every animation to the first one's start time", () => {
    const a = { startTime: 138 } as unknown as Animation;
    const b = { startTime: 900 } as unknown as Animation;
    lockToSweep([a, b]);
    expect(sweepOrigin()).toBe(138);
    expect(b.startTime).toBe(138);

    const late = { startTime: 4000 } as unknown as Animation;
    lockToSweep([late]);
    expect(late.startTime).toBe(138);
  });

  it("waits for a resolved start time", () => {
    const pending = { startTime: null } as unknown as Animation;
    lockToSweep([pending]);
    expect(sweepOrigin()).toBe(0);
    expect(pending.startTime).toBeNull();
  });
});
