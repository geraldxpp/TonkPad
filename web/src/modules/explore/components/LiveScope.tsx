"use client";

import { type ReactNode, useState } from "react";
import { SweepCountdown } from "@/modules/shell/components/SweepCountdown";
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
  subtitle: string;
}

function Legend({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-[7px] rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

export function LiveScope({ blips, subtitle }: LiveScopeProps) {
  // The window only switches the active pill for now; the data is static.
  const [scopeWindow, setScopeWindow] = useState<ScopeWindow>("5m");
  return (
    <section
      aria-labelledby="scope-title"
      className="flex min-w-0 max-w-[520px] flex-[1_1_360px] flex-col gap-3 overflow-hidden rounded-3xl border border-line px-6 py-5 shadow-panel [background:radial-gradient(60%_60%_at_50%_55%,rgba(123,102,255,0.18),rgba(123,102,255,0)_70%),#0D0F17]"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
          <h2 id="scope-title" className="m-0 text-[14px] font-semibold">
            Live scope
          </h2>
          <span className="text-[12px] text-text-3">{subtitle}</span>
        </div>
        <Segmented size="sm" label="Scope window" options={WINDOWS} value={scopeWindow} onChange={setScopeWindow} />
      </div>
      <Radar blips={blips} />
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[12px] text-text-2">
        <Legend color="#8C7BFF">New</Legend>
        <Legend color="#FF7A45">Heating up</Legend>
        <Legend color="#F4C553">Graduating</Legend>
        <span className="flex-auto" />
        <span className="text-text-3">
          Next sweep <SweepCountdown className="font-mono text-[12px] font-semibold text-accent-text" />
        </span>
      </div>
    </section>
  );
}
