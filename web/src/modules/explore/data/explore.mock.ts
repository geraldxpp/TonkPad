/**
 * Mock data for Explore, ported from the `DATA`, `C2`, `BL`, `PADC` tables and
 * counts in design-reference/explore.dc.html. The tokens themselves live in
 * shared/data/mock-tokens.ts, since the token screen shows them too. Raw
 * numbers are formatted by shared/lib/format.ts; the tests pin the formatted
 * strings to the design.
 */
import { SPARK, TOKENS } from "@/shared/data/mock-tokens";
import type { LaunchpadId } from "@/shared/types/launchpad";

export { SPARK, TOKENS };

/** "Heating up now" cards and their art background colours (`C2`). */
export const HEATING: ReadonlyArray<{ ticker: string; color: string }> = [
  { ticker: "GHOST", color: "#24186E" },
  { ticker: "SCAT", color: "#7A2414" },
  { ticker: "ORB", color: "#3A0E6C" },
  { ticker: "MOON", color: "#0C1450" },
  { ticker: "SHRM", color: "#07433C" },
];

export interface BlipSeed {
  ticker: string;
  /** Degrees, clockwise from 3 o'clock. */
  angle: number;
  /** 0 (centre) to 1 (rim). */
  distance: number;
  size: number;
  label: string | null;
  glow: string;
  labelSide: "left" | "right" | null;
}

/** Radar blips (`BL`): [ticker, angle, distance, size, label, glow, labelSide]. */
export const BLIPS: readonly BlipSeed[] = [
  { ticker: "GHOST", angle: -64, distance: 0.6, size: 36, label: "+412%", glow: "#7B66FF", labelSide: "right" },
  { ticker: "ORB", angle: 200, distance: 0.5, size: 30, label: "+221%", glow: "#C65BFF", labelSide: "left" },
  { ticker: "MOON", angle: 125, distance: 0.72, size: 28, label: null, glow: "#3F5DFF", labelSide: null },
  { ticker: "SCAT", angle: -18, distance: 0.86, size: 26, label: null, glow: "#FF9A4D", labelSide: null },
  { ticker: "BOLT", angle: -112, distance: 0.84, size: 24, label: null, glow: "#27C8F2", labelSide: null },
  { ticker: "MOCHI", angle: 62, distance: 0.42, size: 24, label: null, glow: "#FF8FD6", labelSide: null },
  { ticker: "TIDE", angle: 20, distance: 0.36, size: 22, label: null, glow: "#46D9F2", labelSide: null },
];

export type PadFilterId = "all" | LaunchpadId;

/** Launchpad chips and their token counts (`PADC`), then "+3 more". */
export const LAUNCHPAD_COUNTS: ReadonlyArray<{ id: PadFilterId; count: number }> = [
  { id: "all", count: 8_412 },
  { id: "tonk", count: 1_846 },
  { id: "pons", count: 624 },
  { id: "pump", count: 3_904 },
  { id: "bonk", count: 1_022 },
  { id: "bags", count: 512 },
  { id: "moon", count: 304 },
];
export const MORE_LAUNCHPADS = 3;

export const TOTAL_TOKENS = 8_412;

/** Chain counts for the chain filter that joins the list toolbar on phones. */
export const CHAIN_COUNTS = { all: 8_412, sol: 5_941, rh: 2_471 } as const;

export interface HeroStat {
  /** Key of the label in the `hero` messages. */
  id: "tokensToday" | "volume24h" | "launched5m" | "graduatedToday";
  value: number;
  kind: "count" | "usd";
}

export const HERO_STATS: readonly HeroStat[] = [
  { id: "tokensToday", value: 8_412, kind: "count" },
  { id: "volume24h", value: 41_800_000, kind: "usd" },
  { id: "launched5m", value: 37, kind: "count" },
  { id: "graduatedToday", value: 212, kind: "count" },
];

export const MISSION_PICK = { ticker: "GHOST", price: 0.0000582, updatedSecondsAgo: 12 } as const;

/** Live scope subtitle: "Sweeping Tonkpad, Pons, Pump.fun +5". */
export const SCOPE_PADS: readonly LaunchpadId[] = ["tonk", "pons", "pump"];
export const SCOPE_MORE = 5;
