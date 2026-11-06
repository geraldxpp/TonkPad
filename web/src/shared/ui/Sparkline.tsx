import { sparklineFor } from "@/shared/lib/sparkline";
import type { SparkSeed } from "@/shared/types/token";

interface SparklineProps {
  seed: SparkSeed;
  /** Green when the 24h change is up, red when down. */
  up: boolean;
  width?: number;
  height?: number;
  /**
   * Placement classes. The table passes "inline" (the SVG sits on the text
   * baseline); cards let it shrink as a flex item.
   */
  className?: string;
}

export function Sparkline({ seed, up, width = 96, height = 32, className }: SparklineProps) {
  const { line, area } = sparklineFor(seed);
  return (
    <svg width={width} height={height} viewBox="0 0 96 32" fill="none" aria-hidden="true" className={className}>
      <path d={area} className={up ? "fill-pos/12" : "fill-neg/12"} />
      <path
        d={line}
        className={up ? "stroke-pos" : "stroke-neg"}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
