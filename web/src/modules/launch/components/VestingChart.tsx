import type { LockType } from "@/shared/tonk/rules";

interface VestingChartProps {
  type: Exclude<LockType, "none">;
  /** What the chart shows, for screen readers. */
  label: string;
  /** "Today", the midpoint and the end, as day counts under the chart. */
  ticks: [string, string, string];
}

const W = 200;
const H = 70;

/** The locked balance over time: a straight decline for a vest, a flat line that drops at the end for a time-lock. */
export function VestingChart({ type, label, ticks }: VestingChartProps) {
  const line = type === "linear" ? `M0 4 L${W} ${H}` : `M0 4 L${W - 2} 4 L${W - 2} ${H}`;
  const area = type === "linear" ? `M0 4 L${W} ${H} L0 ${H} Z` : `M0 4 L${W - 2} 4 L${W - 2} ${H} L0 ${H} Z`;
  return (
    <figure className="m-0 mt-2.5">
      <svg viewBox={`0 0 ${W} ${H + 2}`} role="img" aria-label={label} preserveAspectRatio="none" className="block h-[84px] w-full overflow-visible">
        <path d={area} className="fill-pos/12" />
        <path d={line} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="stroke-pos" />
        <line x1="0" y1={H} x2={W} y2={H} strokeWidth="1" vectorEffect="non-scaling-stroke" className="stroke-line" />
      </svg>
      <figcaption className="mt-1.5 flex justify-between gap-2 font-mono text-[10px] text-text-3">
        {ticks.map((tick, index) => (
          // Keyed by place: the three slots are fixed, and two of them can read alike.
          <span key={index}>{tick}</span>
        ))}
      </figcaption>
    </figure>
  );
}
