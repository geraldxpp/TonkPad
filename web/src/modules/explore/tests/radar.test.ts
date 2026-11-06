import { describe, expect, it } from "vitest";
import { BLIPS } from "../data/explore.mock";
import {
  blipCenter,
  estimateLabelWidth,
  LABEL_BOUNDS,
  layoutBlip,
  pingDelay,
  placeLabel,
  SWEEP_SECONDS,
} from "../lib/radar";

/** The reference's own formulas, used as the oracle. */
const refLeft = (a: number, d: number, s: number) => (150 + d * 150 * Math.cos((a * Math.PI) / 180) - s / 2).toFixed(1);
const refTop = (a: number, d: number, s: number) => (150 + d * 150 * Math.sin((a * Math.PI) / 180) - s / 2).toFixed(1);

describe("blipCenter", () => {
  it("measures angles clockwise from 3 o'clock around (150, 150)", () => {
    expect(blipCenter(0, 1)).toEqual({ x: 300, y: 150 });
    const down = blipCenter(90, 1);
    expect(down.x).toBeCloseTo(150, 9);
    expect(down.y).toBeCloseTo(300, 9);
    const up = blipCenter(-90, 0.5);
    expect(up.y).toBeCloseTo(75, 9);
  });

  it.each(BLIPS.map((b) => [b.ticker, b] as const))("places %s exactly where the reference does", (_, blip) => {
    const layout = layoutBlip(blip);
    expect(layout.left.toFixed(1)).toBe(refLeft(blip.angle, blip.distance, blip.size));
    expect(layout.top.toFixed(1)).toBe(refTop(blip.angle, blip.distance, blip.size));
  });
});

describe("pingDelay", () => {
  it("is when the leading edge (starting 40° clockwise from 12 o'clock) reaches the blip", () => {
    expect(pingDelay(-50)).toBe(0); // the edge starts here
    expect(pingDelay(40)).toBeCloseTo(1.5, 9); // a quarter turn later
    expect(pingDelay(-51)).toBeCloseTo(SWEEP_SECONDS - SWEEP_SECONDS / 360, 9);
  });

  it.each([
    ["GHOST", -64, 5.7667],
    ["ORB", 200, 4.1667],
    ["MOON", 125, 2.9167],
    ["SCAT", -18, 0.5333],
    ["BOLT", -112, 4.9667],
    ["MOCHI", 62, 1.8667],
    ["TIDE", 20, 1.1667],
  ])("%s at %d° pings after %ds", (_, angle, seconds) => {
    expect(pingDelay(angle)).toBeCloseTo(seconds, 3);
    expect(pingDelay(angle)).toBe(((((angle + 50) % 360) + 360) % 360) / 360 * 6);
  });

  it("always falls inside one sweep", () => {
    for (let a = -720; a <= 720; a += 7) {
      const t = pingDelay(a);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(SWEEP_SECONDS);
    }
  });
});

describe("labels", () => {
  it("moves $ORB +221% to the right of its blip so it stays inside the card", () => {
    const orb = BLIPS.find((b) => b.ticker === "ORB");
    expect(orb?.labelSide).toBe("left");
    expect(layoutBlip(orb!).label?.side).toBe("right");
  });

  it("keeps $GHOST +412% on its designed side", () => {
    const ghost = BLIPS.find((b) => b.ticker === "GHOST");
    expect(layoutBlip(ghost!).label?.side).toBe("right");
  });

  it("keeps every label inside the card's bounds", () => {
    for (const blip of BLIPS) {
      const label = layoutBlip(blip).label;
      if (!label || !blip.label) continue;
      const width = estimateLabelWidth(`$${blip.ticker}`, blip.label);
      expect(label.left).toBeGreaterThanOrEqual(LABEL_BOUNDS.min);
      expect(label.left + width).toBeLessThanOrEqual(LABEL_BOUNDS.max);
    }
  });

  it("flips to the other side when only that side fits", () => {
    expect(placeLabel(60, 20, 100, "left")).toEqual({ left: 80, side: "right" });
    expect(placeLabel(260, 20, 100, "right")).toEqual({ left: 140, side: "left" });
  });

  it("clamps into the bounds when neither side fits", () => {
    const placed = placeLabel(150, 20, 200, "left");
    expect(placed).toEqual({ left: LABEL_BOUNDS.min, side: "left" });
  });
});
