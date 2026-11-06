import { cn } from "@/shared/lib/cn";
import { formatInteger, formatUsdCompact } from "@/shared/lib/format";
import type { HeroStat } from "../data/explore.mock";

interface HeroStatsProps {
  stats: readonly HeroStat[];
}

export function HeroStats({ stats }: HeroStatsProps) {
  return (
    <dl className="m-0 flex flex-wrap gap-y-4 max-md:grid max-md:grid-cols-2">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={cn(
            "flex flex-col-reverse gap-0.5",
            index === 0 ? "pr-6" : "border-l border-line px-6",
            // Below 768 px the stats sit in a 2 × 2 grid: no divider at the start of a row.
            index % 2 === 0 && "max-md:border-l-0 max-md:pl-0",
          )}
        >
          <dt className="text-[12px] text-text-3">{stat.label}</dt>
          <dd className="m-0 font-mono text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums">
            {stat.kind === "usd" ? formatUsdCompact(stat.value) : formatInteger(stat.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
