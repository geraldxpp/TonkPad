import { LayoutGrid, List, Lock, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
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
  /** Phones only: the chain filter, which leaves the top bar there. */
  chainControl?: ReactNode;
}

/**
 * List tabs, timeframe, Filters (UI only) and the list/grid toggle (grid is
 * UI only). On phones the tabs become one swipeable row, the chain filter
 * joins the timeframe, and the list/grid toggle is dropped.
 */
export function ListToolbar({ view, onTab, onTimeframe, chainControl }: ListToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 max-md:gap-2">
      <Tabs
        tabs={TAB_ITEMS}
        value={view.tab}
        onChange={onTab}
        label="Token lists"
        panelId={TOKEN_PANEL_ID}
        idPrefix={TOKEN_TAB_PREFIX}
        className="max-md:w-full max-md:flex-nowrap max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden"
      />
      <span className="flex-[1_1_0] max-md:hidden" />
      <Segmented options={TIMEFRAMES} value={view.tf} onChange={onTimeframe} label="Timeframe" />
      {chainControl ? <div className="md:hidden">{chainControl}</div> : null}
      <button
        type="button"
        aria-label="Filters, 2 active"
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-raised pr-3 pl-3.5 text-[14px] font-semibold text-text max-md:ml-auto max-md:pl-3"
      >
        <SlidersHorizontal size={16} strokeWidth={1.8} />
        <span className="max-md:sr-only">Filters</span>
        <span className="rounded-md bg-[rgba(140,123,255,0.14)] px-1.5 py-px font-mono text-[12px] font-semibold text-accent-text">
          2
        </span>
      </button>
      <div role="group" aria-label="View" className="flex gap-0.5 rounded-xl border border-line bg-surface p-1 max-md:hidden">
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
