import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { Segmented } from "@/shared/ui/Segmented";
import { type TabItem, Tabs } from "@/shared/ui/Tabs";
import { type ExploreView, TABS, type TabId, type Timeframe, TIMEFRAMES } from "../lib/view";

export const TOKEN_PANEL_ID = "token-panel";
export const TOKEN_TAB_PREFIX = "token-tab";

const LOCK_ICON = <Lock size={13} strokeWidth={2.4} className="text-locked" />;

interface ListToolbarProps {
  view: ExploreView;
  onTab?: (tab: TabId) => void;
  onTimeframe?: (tf: Timeframe) => void;
  /** Phones only: the chain filter, which leaves the top bar there. */
  chainControl?: ReactNode;
}

/**
 * The card's top edge: underlined list tabs and the timeframe. Under 1024 px
 * the tabs take a swipeable row of their own and the timeframe moves below
 * them; on phones the chain filter joins the timeframe.
 */
export function ListToolbar({ view, onTab, onTimeframe, chainControl }: ListToolbarProps) {
  const { t } = useI18n();
  const tabs: readonly TabItem<TabId>[] = TABS.map((id) => ({
    id,
    label: t.tabs[id],
    icon: id === "locked" ? LOCK_ICON : undefined,
  }));
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 border-b border-line px-4 max-md:px-3">
      <Tabs
        tabs={tabs}
        value={view.tab}
        onChange={onTab}
        label={t.tabs.label}
        panelId={TOKEN_PANEL_ID}
        idPrefix={TOKEN_TAB_PREFIX}
        size="underline"
        className="flex-1 max-lg:basis-full"
      />
      <div className="flex flex-none items-center gap-3 py-3 max-lg:ml-auto max-md:w-full max-md:justify-between">
        <Segmented size="xs" options={TIMEFRAMES} value={view.tf} onChange={onTimeframe} label={t.toolbar.timeframe} />
        {chainControl ? <div className="md:hidden">{chainControl}</div> : null}
      </div>
    </div>
  );
}
