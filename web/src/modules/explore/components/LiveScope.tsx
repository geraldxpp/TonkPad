"use client";

import { type ReactNode, useState } from "react";
import { SweepCountdown } from "@/modules/shell/components/SweepCountdown";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { Segmented } from "@/shared/ui/Segmented";
import type { ExploreData } from "../data/get-explore-data";
import { Radar } from "./Radar";

const WINDOWS = [
  { id: "1m", label: "1m" },
  { id: "5m", label: "5m" },
  { id: "1h", label: "1h" },
] as const;

type ScopeWindow = (typeof WINDOWS)[number]["id"];

interface LiveScopeProps {
  blips: ExploreData["blips"];
  scope: ExploreData["scope"];
}

function Legend({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-[7px] rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

export function LiveScope({ blips, scope }: LiveScopeProps) {
  const { t } = useI18n();
  // The window only switches the active pill for now; the data is static.
  const [scopeWindow, setScopeWindow] = useState<ScopeWindow>("5m");
  return (
    <section
      aria-labelledby="scope-title"
      className="flex min-w-0 max-w-[520px] flex-[1_1_360px] flex-col gap-3 max-lg:max-w-none overflow-hidden rounded-3xl border border-line px-6 py-5 shadow-panel [background:radial-gradient(60%_60%_at_50%_55%,rgb(var(--accent-rgb)/0.16),transparent_70%),var(--surface)]"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
          <h2 id="scope-title" className="m-0 text-[14px] font-semibold">
            {t.scope.title}
          </h2>
          <span className="text-[12px] text-text-3">
            {fmt(t.scope.sweeping, { pads: scope.pads.join(", "), more: scope.more })}
          </span>
        </div>
        <Segmented size="sm" label={t.scope.window} options={WINDOWS} value={scopeWindow} onChange={setScopeWindow} />
      </div>
      <Radar blips={blips} />
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[12px] text-text-2">
        <Legend color="var(--accent)">{t.scope.new}</Legend>
        <Legend color="var(--hot)">{t.scope.heating}</Legend>
        <Legend color="var(--gold)">{t.scope.graduating}</Legend>
        <span className="flex-auto" />
        <span className="text-text-3">
          {t.scope.nextSweep} <SweepCountdown className="font-mono text-[12px] font-semibold text-accent-text" />
        </span>
      </div>
    </section>
  );
}
