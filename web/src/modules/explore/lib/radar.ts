/**
 * Radar maths. The scope is a 300 px square: centre (150, 150), radius 150.
 * Angles are degrees clockwise from 3 o'clock. The sweep's leading edge starts
 * 40° clockwise from 12 o'clock (that is, at -50°) and turns once every 6 s.
 */
export const RADAR_SIZE = 300;
export const RADAR_CENTER = 150;
export const RADAR_RADIUS = 150;
export const SWEEP_SECONDS = 6;
const LEADING_EDGE_START = -50;

export function blipCenter(angle: number, distance: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return {
    x: RADAR_CENTER + distance * RADAR_RADIUS * Math.cos(rad),
    y: RADAR_CENTER + distance * RADAR_RADIUS * Math.sin(rad),
  };
}

/** Seconds after the sweep starts until its leading edge reaches `angle`. */
export function pingDelay(angle: number): number {
  const travelled = ((((angle - LEADING_EDGE_START) % 360) + 360) % 360);
  return (travelled / 360) * SWEEP_SECONDS;
}

/** Label sizing, measured from the rendered pill (12 px Geist + Geist Mono). */
export const LABEL = { gap: 10, halfHeight: 13, chrome: 24, perTickChar: 7.6, perValueChar: 7.2 } as const;

/**
 * Horizontal room a label may use, relative to the radar box. The scope card
 * is never narrower than ~358 px, which leaves its 24 px padding plus at
 * least 4 px of centring on each side of the 300 px radar.
 */
export const LABEL_BOUNDS = { min: -28, max: RADAR_SIZE + 28 } as const;

export function estimateLabelWidth(tick: string, value: string): number {
  return Math.ceil(LABEL.chrome + tick.length * LABEL.perTickChar + value.length * LABEL.perValueChar);
}

export type LabelSide = "left" | "right";

/**
 * Puts a label beside its blip on the preferred side, or on the other side
 * when the preferred one would leave the card. This fixes the reference's
 * clipped "$ORB +221%" label.
 */
export function placeLabel(x: number, size: number, width: number, preferred: LabelSide): { left: number; side: LabelSide } {
  const at: Record<LabelSide, number> = {
    left: x - size / 2 - LABEL.gap - width,
    right: x + size / 2 + LABEL.gap,
  };
  const fits = (left: number) => left >= LABEL_BOUNDS.min && left + width <= LABEL_BOUNDS.max;
  const other: LabelSide = preferred === "left" ? "right" : "left";
  if (fits(at[preferred])) return { left: at[preferred], side: preferred };
  if (fits(at[other])) return { left: at[other], side: other };
  const clamped = Math.min(Math.max(at[preferred], LABEL_BOUNDS.min), LABEL_BOUNDS.max - width);
  return { left: clamped, side: preferred };
}

export interface BlipInput {
  ticker: string;
  angle: number;
  distance: number;
  size: number;
  label: string | null;
  labelSide: LabelSide | null;
}

export interface BlipLayout {
  left: number;
  top: number;
  /** Ping delay in seconds. */
  delay: number;
  label: { left: number; top: number; side: LabelSide } | null;
}

/** The reference writes positions with toFixed(1); matching it keeps pixel snapping identical. */
const tenth = (value: number) => Math.round(value * 10) / 10;

export function layoutBlip(blip: BlipInput): BlipLayout {
  const { x, y } = blipCenter(blip.angle, blip.distance);
  let label: BlipLayout["label"] = null;
  if (blip.label) {
    const width = estimateLabelWidth(`$${blip.ticker}`, blip.label);
    const placed = placeLabel(x, blip.size, width, blip.labelSide ?? "right");
    label = { left: tenth(placed.left), top: tenth(y - LABEL.halfHeight), side: placed.side };
  }
  return { left: tenth(x - blip.size / 2), top: tenth(y - blip.size / 2), delay: pingDelay(blip.angle), label };
}
