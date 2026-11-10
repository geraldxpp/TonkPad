"use client";

import { ChevronDown, Radio } from "lucide-react";
import type { ReactNode } from "react";
import { SweepCountdown } from "@/modules/shell/components/SweepCountdown";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import type { ExploreData } from "../data/get-explore-data";
import { Radar } from "./Radar";

interface LiveScopeProps {
  blips: ExploreData["blips"];
  scope: ExploreData["scope"];
}

function Legend({ dot, children }: { dot: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

/**
 * The Launch radar, folded under the token list: a one-line summary (which
 * launchpads it sweeps, with a live pulse) that opens onto the scope, its
 * legend and the countdown to the next sweep. The radar keeps the shared
 * sweep clock, so it is in step whenever it is opened.
 */
export function LiveScope({ blips, scope }: LiveScopeProps) {
  const { t } = useI18n();
  const sweeping =
    scope.more > 0
      ? fmt(t.scope.sweeping, { pads: scope.pads.join(", "), more: scope.more })
      : fmt(t.scope.sweepingOnly, { pads: scope.pads.join(", ") });
  return (
    <details className="group rounded-xl border border-line bg-surface/50">
      <summary
        data-testid="radar-toggle"
        className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-2 text-[12px] [&::-webkit-details-marker]:hidden"
      >
        <Radio size={15} strokeWidth={1.8} aria-hidden="true" className="text-accent-text" />
        <span className="font-semibold">{t.scope.radar}</span>
        <span className="min-w-0 flex-1 truncate text-text-3">{sweeping}</span>
        <span aria-hidden="true" className="tk-pulse size-1.5 rounded-full bg-pos" />
        <ChevronDown size={15} strokeWidth={2} aria-hidden="true" className="text-text-3 transition-transform group-open:rotate-180" />
      </summary>
      <section
        aria-labelledby="scope-title"
        className="flex flex-wrap items-center justify-center gap-6 border-t border-line px-4 pt-4 pb-6"
      >
        <Radar blips={blips} />
        <div className="flex max-w-[320px] flex-col items-start gap-4">
          <div>
            <h2 id="scope-title" className="font-display text-xl font-bold">
              {t.scope.title}
            </h2>
            <p className="mt-2 text-[13px] leading-5 text-text-3">{t.scope.caption}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-[11px] text-text-2">
            <Legend dot="bg-accent">{t.scope.new}</Legend>
            <Legend dot="bg-hot">{t.scope.heating}</Legend>
            <Legend dot="bg-gold">{t.scope.graduating}</Legend>
          </div>
          <span className="text-[12px] text-text-3">
            {t.scope.nextSweep} <SweepCountdown className="font-mono font-semibold text-accent-text" />
          </span>
        </div>
      </section>
    </details>
  );
}
