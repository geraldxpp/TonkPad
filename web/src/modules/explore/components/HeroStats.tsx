import { getI18n } from "@/shared/i18n/server";
import { cn } from "@/shared/lib/cn";
import { formatInteger, formatUsdCompact } from "@/shared/lib/format";
import type { HeroStat } from "../data/explore.mock";

interface HeroStatsProps {
  stats: readonly HeroStat[];
}

/**
 * The four headline numbers. Below 1280 px, where the hero column is narrow,
 * they sit in an even four-column grid so they never wrap onto a second line.
 * The numbers stay on one line across the row even when a translated label
 * wraps (the cell is column-reverse, so justify-end packs it to the top).
 */
export async function HeroStats({ stats }: HeroStatsProps) {
  const { t } = await getI18n();
  return (
    <dl className="m-0 flex flex-wrap gap-y-4 max-xl:grid max-xl:grid-cols-4">
      {stats.map((stat, index) => (
        <div
          key={stat.id}
          className={cn(
            "flex min-w-0 flex-col-reverse justify-end gap-0.5",
            index === 0 ? "pr-6 max-md:pr-2" : "border-l border-line px-6 max-md:px-2.5",
          )}
        >
          <dt className="text-[12px] text-text-3 max-md:text-[11px] max-md:leading-[14px]">{t.hero[stat.id]}</dt>
          <dd className="m-0 font-mono text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums max-md:text-[16px] max-md:leading-6">
            {stat.kind === "usd" ? formatUsdCompact(stat.value) : formatInteger(stat.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
