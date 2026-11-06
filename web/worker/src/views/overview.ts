import { LAUNCHPADS } from "@/shared/config/launchpads";
import type { LiveBlip, LiveOverview, LivePadFilter } from "@/shared/types/live";
import type { LaunchpadId } from "@/shared/types/launchpad";
import type { TrackedToken } from "../model";
import { missionScore } from "../score";
import { buysLast15m, toToken } from "../tokens";
import { HOT_BUYS, launchedToday, MIN_LISTED_MCAP } from "./list";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** The chips the design shows, in order; any other launchpad counts towards "+N more". */
const CHIP_PADS: readonly LaunchpadId[] = ["tonk", "pons", "pump", "bonk", "bags", "moon"];

/** Dark art-tile backgrounds for the Heating up cards, picked per token. */
const CARD_COLORS = ["#24186E", "#7A2414", "#3A0E6C", "#0C1450", "#07433C", "#4A1D0E", "#102E4A", "#3B1030"];
/** Radar glows, matching the legend: New, Heating up, Graduating. */
const GLOW = { new: "#3D8EF0", heating: "#FF7A45", graduating: "#F4C553" } as const;

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** A whole-percent change label: "+412%", "−13%", or "0%" when it rounds to nothing. */
export function pct(change: number): string {
  const rounded = Math.round(change);
  return rounded === 0 ? "0%" : `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%`;
}

export function overviewView(tokens: readonly TrackedToken[], ingesting: readonly LaunchpadId[], now: number): LiveOverview {
  const today = launchedToday(tokens, now);
  const priced = tokens.filter((t) => t.marketAt > 0);
  const velocity = new Map(priced.map((t) => [t.address, buysLast15m(t, now)]));
  const v = (t: TrackedToken) => velocity.get(t.address) ?? 0;
  const heatingTokens = priced.filter((t) => v(t) >= 5 && t.marketCap >= 2 * MIN_LISTED_MCAP).sort((a, b) => v(b) - v(a));
  const token = (t: TrackedToken) => toToken(t, now, v(t) >= HOT_BUYS);

  const pickSource =
    heatingTokens.slice(0, 20).find((t) => missionScore(t, now).score >= 60 && t.marketCap >= 15_000) ?? heatingTokens[0];

  const padCount = (id: LaunchpadId) => today.filter((t) => t.launchpad === id).length;
  const chips: Array<{ id: LivePadFilter; count: number }> = [
    { id: "all", count: today.length },
    ...CHIP_PADS.map((id) => ({ id, count: padCount(id) })),
  ];
  const others = (Object.keys(LAUNCHPADS) as LaunchpadId[]).filter((id) => !CHIP_PADS.includes(id) && padCount(id) > 0);

  return {
    stats: [
      { id: "tokensToday", value: today.length, kind: "count" },
      { id: "volume24h", value: priced.reduce((sum, t) => sum + t.windows.h24.volume, 0), kind: "usd" },
      { id: "launched5m", value: tokens.filter((t) => now - t.createdAt <= 5 * MINUTE).length, kind: "count" },
      {
        id: "graduatedToday",
        value: tokens.filter((t) => t.graduatedAt !== null && now - t.graduatedAt <= DAY).length,
        kind: "count",
      },
    ],
    totalTokens: today.length,
    missionPick: pickSource
      ? { token: token(pickSource), price: pickSource.priceUsd, updatedSecondsAgo: Math.round((now - pickSource.marketAt) / 1000) }
      : null,
    heating: heatingTokens.slice(0, 5).map((t) => ({ token: token(t), color: CARD_COLORS[hash(t.address) % CARD_COLORS.length] })),
    blips: radarBlips(priced, heatingTokens, now),
    scope: { pads: ingesting.slice(0, 3).map((id) => LAUNCHPADS[id].name), more: Math.max(0, ingesting.length - 3) },
    launchpads: chips,
    moreLaunchpads: others.length,
    chainCounts: {
      all: today.length,
      sol: today.filter((t) => t.chain === "sol").length,
      rh: today.filter((t) => t.chain === "rh").length,
    },
    updatedAt: now,
  };
}

interface Slot {
  /** Degrees, clockwise from 3 o'clock. */
  angle: number;
  /** 0 (centre) to 1 (rim). */
  distance: number;
  size: number;
  labelSide: "left" | "right" | null;
}

/**
 * Where each kind of blip sits, taken from the approved design, so blips
 * never overlap and the two labelled ones keep clear of each other.
 */
const SLOTS = {
  heating: [
    { angle: -64, distance: 0.6, size: 36, labelSide: "right" },
    { angle: 200, distance: 0.5, size: 30, labelSide: "left" },
  ],
  new: [
    { angle: 62, distance: 0.42, size: 24, labelSide: null },
    { angle: 20, distance: 0.36, size: 22, labelSide: null },
    { angle: 125, distance: 0.72, size: 28, labelSide: null },
  ],
  graduating: [
    { angle: -18, distance: 0.86, size: 26, labelSide: null },
    { angle: -112, distance: 0.84, size: 24, labelSide: null },
  ],
} as const satisfies Record<keyof typeof GLOW, readonly Slot[]>;

/**
 * Up to seven blips: the two hottest tokens (labelled with their 1h change),
 * three of the newest active launches near the centre and two tokens close to
 * graduating near the rim. A token appears once, in the first group it fits.
 */
export function radarBlips(priced: readonly TrackedToken[], heating: readonly TrackedToken[], now: number): LiveBlip[] {
  const used = new Set<string>();
  const take = (list: readonly TrackedToken[], count: number) => {
    const picked = list.filter((t) => !used.has(t.address)).slice(0, count);
    picked.forEach((t) => used.add(t.address));
    return picked;
  };
  const hot = take(heating, SLOTS.heating.length);
  const fresh = take(
    priced.filter((t) => now - t.createdAt < 30 * MINUTE && t.windows.h24.buys > 0).sort((a, b) => b.createdAt - a.createdAt),
    SLOTS.new.length,
  );
  const graduating = take(
    priced.filter((t) => !t.graduated && t.curve >= 0.6).sort((a, b) => b.curve - a.curve),
    SLOTS.graduating.length,
  );

  const blip = (t: TrackedToken, kind: keyof typeof GLOW, slot: Slot, label: string | null): LiveBlip => ({
    address: t.address,
    ticker: t.symbol || "???",
    art: t.image ?? "",
    angle: slot.angle,
    distance: slot.distance,
    size: slot.size,
    label,
    glow: GLOW[kind],
    labelSide: label ? slot.labelSide : null,
  });

  return [
    ...hot.map((t, i) => blip(t, "heating", SLOTS.heating[i], pct(t.windows.h1.change))),
    ...fresh.map((t, i) => blip(t, "new", SLOTS.new[i], null)),
    ...graduating.map((t, i) => blip(t, "graduating", SLOTS.graduating[i], null)),
  ];
}
