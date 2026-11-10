"use client";

import { Activity, ArrowUpRight, Layers, type LucideIcon, Radio } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatInteger, formatUsdCompact } from "@/shared/lib/format";
import type { LiveStat } from "@/shared/types/live";

const ICONS: Record<LiveStat["id"], LucideIcon> = {
  tokensToday: Layers,
  volume24h: Activity,
  launched5m: Radio,
  graduatedToday: ArrowUpRight,
};

/**
 * The four market numbers in one bordered strip: four columns from 768 px, two
 * by two on phones (where the icons step aside). The -1 px margins let the
 * cells share single borders however the grid wraps.
 */
export function HeroStats({ stats }: { stats: readonly LiveStat[] }) {
  const { t } = useI18n();
  return (
    <dl
      aria-label={t.hero.market}
      className="m-0 grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface md:grid-cols-4"
    >
      {stats.map((stat) => {
        const Icon = ICONS[stat.id];
        return (
          <div
            key={stat.id}
            className="-mt-px -ml-px flex min-w-0 items-center gap-3 border-t border-l border-line px-4 py-3.5 max-md:gap-2 max-md:px-3"
          >
            <span className="flex size-9 flex-none items-center justify-center rounded-lg border border-line bg-raised text-accent-text max-md:hidden">
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-[11px] text-text-3">{t.hero[stat.id]}</dt>
              <dd className="m-0 font-mono text-[20px] leading-6 font-semibold tracking-[-0.04em] tabular-nums max-md:text-[18px]">
                {stat.kind === "usd" ? formatUsdCompact(stat.value) : formatInteger(stat.value)}
              </dd>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
