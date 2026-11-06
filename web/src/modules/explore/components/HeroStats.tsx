import { cn } from "@/shared/lib/cn";
import { formatInteger, formatUsdCompact } from "@/shared/lib/format";
import type { HeroStat } from "../data/explore.mock";

interface HeroStatsProps {
  stats: readonly HeroStat[];
}

/** The four headline numbers. Under 768 px they tighten into one four-column strip. */
export function HeroStats({ stats }: HeroStatsProps) {
  return (
    <dl className="m-0 flex flex-wrap gap-y-4 max-md:grid max-md:grid-cols-4">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={cn(
            "flex min-w-0 flex-col-reverse gap-0.5",
            index === 0 ? "pr-6 max-md:pr-2" : "border-l border-line px-6 max-md:px-2.5",
          )}
        >
          <dt className="text-[12px] text-text-3 max-md:text-[11px] max-md:leading-[14px]">{stat.label}</dt>
          <dd className="m-0 font-mono text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums max-md:text-[16px] max-md:leading-6">
            {stat.kind === "usd" ? formatUsdCompact(stat.value) : formatInteger(stat.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
