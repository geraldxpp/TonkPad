import { sparklineFor } from "@/shared/lib/sparkline";
import type { SparkSeed } from "@/shared/types/token";

interface SparklineProps {
  seed: SparkSeed;
  /** Green when the 24h change is up, red when down (as in the reference). */
  up: boolean;
  width?: number;
  height?: number;
  /**
   * Placement classes. The table passes "inline" (the reference's SVG sits on
   * the text baseline); cards let it shrink as a flex item.
   */
  className?: string;
}

export function Sparkline({ seed, up, width = 96, height = 32, className }: SparklineProps) {
  const { line, area } = sparklineFor(seed);
  return (
    <svg width={width} height={height} viewBox="0 0 96 32" fill="none" aria-hidden="true" className={className}>
      <path d={area} fill={up ? "rgba(54,214,140,0.12)" : "rgba(255,92,116,0.12)"} />
      <path
        d={line}
        stroke={up ? "#36D68C" : "#FF5C74"}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
