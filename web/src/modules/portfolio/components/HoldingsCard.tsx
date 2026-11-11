"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { Tabs } from "@/shared/ui/Tabs";
import type { PortfolioTab } from "../lib/view";

interface HoldingsCardProps {
  tab: PortfolioTab;
  onTab: (tab: PortfolioTab) => void;
  query: string;
  onQuery: (query: string) => void;
  /** Priced positions in the current view. */
  count: number;
  children: ReactNode;
}

/** The card holding Assets and Activity: its tabs and search, then whichever panel is open. */
export function HoldingsCard({ tab, onTab, query, onQuery, count, children }: HoldingsCardProps) {
  const { t } = useI18n();
  const p = t.portfolio;
  return (
    <section aria-label={p.tabs.region} className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface max-[699px]:order-1">
      <div className="flex min-h-[68px] items-center justify-between gap-5 border-b border-line px-6 max-[699px]:min-h-0 max-[699px]:flex-wrap max-[699px]:gap-3 max-[699px]:px-[17px] max-[699px]:pb-[15px]">
        <Tabs
          size="flush"
          label={p.tabs.label}
          panelId="portfolio-panel"
          idPrefix="portfolio-tab"
          value={tab}
          onChange={onTab}
          className="-mb-px self-stretch max-[699px]:mb-0 max-[699px]:w-full"
          tabs={[
            { id: "assets", label: p.tabs.assets, trailing: <span className="rounded border border-line bg-raised px-[5px] py-0.5 font-mono text-[10px] text-text-3">{count}</span> },
            { id: "activity", label: p.tabs.activity },
          ]}
        />
        <label className="flex w-full max-w-[260px] items-center gap-[9px] rounded-[7px] border border-line bg-bg px-[11px] py-[9px] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cta max-[699px]:max-w-none">
          <Search size={14} strokeWidth={2} className="flex-none text-text-3" aria-hidden="true" />
          <span className="sr-only">{p.search.label}</span>
          <input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={tab === "activity" ? p.search.activity : p.search.assets} autoComplete="off" className="w-full min-w-0 bg-transparent text-[12px] text-text outline-none placeholder:text-text-3" />
        </label>
      </div>
      <div id="portfolio-panel" role="tabpanel" aria-labelledby={`portfolio-tab-${tab}`}>
        {children}
      </div>
    </section>
  );
}
