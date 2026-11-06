import { LayoutGrid, List, Lock, SlidersHorizontal } from "lucide-react";
import { Segmented } from "@/shared/ui/Segmented";
import { type TabItem, Tabs } from "@/shared/ui/Tabs";
import { type ExploreView, TABS, type TabId, type Timeframe, TIMEFRAMES } from "../lib/view";

export const TOKEN_PANEL_ID = "token-panel";
export const TOKEN_TAB_PREFIX = "token-tab";

const TAB_ITEMS: readonly TabItem<TabId>[] = TABS.map((tab) =>
  tab.id === "locked"
    ? { ...tab, icon: <Lock size={13} strokeWidth={2.4} className="text-locked" /> }
    : tab,
);

interface ListToolbarProps {
  view: ExploreView;
  onTab?: (tab: TabId) => void;
  onTimeframe?: (tf: Timeframe) => void;
}

/** List tabs, timeframe, Filters (UI only) and the list/grid toggle (grid is UI only). */
export function ListToolbar({ view, onTab, onTimeframe }: ListToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs
        tabs={TAB_ITEMS}
        value={view.tab}
        onChange={onTab}
        label="Token lists"
        panelId={TOKEN_PANEL_ID}
        idPrefix={TOKEN_TAB_PREFIX}
      />
      <span className="flex-[1_1_0]" />
      <Segmented options={TIMEFRAMES} value={view.tf} onChange={onTimeframe} label="Timeframe" />
      <button
        type="button"
        aria-label="Filters, 2 active"
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-raised pr-3 pl-3.5 text-[14px] font-semibold text-text"
      >
        <SlidersHorizontal size={16} strokeWidth={1.8} />
        Filters
        <span className="rounded-md bg-[rgba(140,123,255,0.14)] px-1.5 py-px font-mono text-[12px] font-semibold text-accent-text">
          2
        </span>
      </button>
      <div role="group" aria-label="View" className="flex gap-0.5 rounded-xl border border-line bg-surface p-1">
        <button
          type="button"
          aria-label="List view"
          aria-pressed="true"
          className="inline-flex size-8 items-center justify-center rounded-[9px] bg-input text-text"
        >
          <List size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label="Grid view"
          aria-pressed="false"
          className="inline-flex size-8 items-center justify-center rounded-[9px] bg-transparent text-text-3"
        >
          <LayoutGrid size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
