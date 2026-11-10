"use client";

import { type ReactNode, useId } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatInteger } from "@/shared/lib/format";
import type { ExploreData } from "../data/get-explore-data";
import type { RankedToken } from "../lib/filter";
import type { ExploreView, TabId, Timeframe } from "../lib/view";
import { DISCOVERY_ID } from "./Hero";
import { LaunchpadChips } from "./LaunchpadChips";
import { ListToolbar, TOKEN_PANEL_ID, TOKEN_TAB_PREFIX } from "./ListToolbar";
import { TokenTable } from "./TokenTable";

export interface TokenListViewProps {
  rows: RankedToken[];
  view: ExploreView;
  launchpads: ExploreData["launchpads"];
  moreLaunchpads: number;
  totalTokens: number;
  /** Phones only: the chain filter shown in the list toolbar. */
  chainControl?: ReactNode;
  onTab?: (tab: TabId) => void;
  onTimeframe?: (tf: Timeframe) => void;
  onPad?: (pad: ExploreView["pad"]) => void;
  onReset?: () => void;
  /** Live list: a new view is loading. */
  busy?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  /** Live list: the latest refresh failed. */
  stale?: boolean;
}

/**
 * "Explore tokens": the heading with the day's token count, then one card
 * holding the tabs and timeframe, the launchpad chips and the table. Purely
 * presentational. "Explore the market" in the hero scrolls here.
 */
export function TokenListView(props: TokenListViewProps) {
  const { t } = useI18n();
  const titleId = useId();
  const { rows, view } = props;
  return (
    <section id={DISCOVERY_ID} aria-labelledby={titleId} className="flex min-w-0 scroll-mt-32 flex-col gap-4 md:scroll-mt-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-[22px] leading-7 font-bold tracking-[-0.025em]">
            {t.table.title}
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-text-3">{t.table.subtitle}</p>
        </div>
        <span className="flex-none rounded-md border border-line bg-surface px-2.5 py-1 font-mono text-[12px] text-text-2">
          {formatInteger(props.totalTokens)}
        </span>
      </div>
      <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
        <ListToolbar view={view} onTab={props.onTab} onTimeframe={props.onTimeframe} chainControl={props.chainControl} />
        <LaunchpadChips launchpads={props.launchpads} more={props.moreLaunchpads} active={view.pad} onPick={props.onPad} />
        <TokenTable
          rows={rows}
          tf={view.tf}
          totalTokens={props.totalTokens}
          panelId={TOKEN_PANEL_ID}
          labelledBy={`${TOKEN_TAB_PREFIX}-${view.tab}`}
          onReset={props.onReset}
          busy={props.busy}
          onLoadMore={props.onLoadMore}
          hasMore={props.hasMore}
          stale={props.stale}
        />
      </div>
    </section>
  );
}
