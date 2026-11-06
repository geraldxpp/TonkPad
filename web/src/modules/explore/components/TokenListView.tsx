"use client";

import type { ReactNode } from "react";
import type { ExploreData } from "../data/get-explore-data";
import type { RankedToken } from "../lib/filter";
import type { ExploreView, TabId, Timeframe } from "../lib/view";
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
}

/** Toolbar, launchpad chips and table for a given view. Purely presentational. */
export function TokenListView(props: TokenListViewProps) {
  const { rows, view } = props;
  return (
    <section aria-label="All tokens" className="flex flex-col gap-3">
      <ListToolbar
        view={view}
        onTab={props.onTab}
        onTimeframe={props.onTimeframe}
        chainControl={props.chainControl}
      />
      <LaunchpadChips
        launchpads={props.launchpads}
        more={props.moreLaunchpads}
        active={view.pad}
        onPick={props.onPad}
      />
      <TokenTable
        rows={rows}
        totalTokens={props.totalTokens}
        panelId={TOKEN_PANEL_ID}
        labelledBy={`${TOKEN_TAB_PREFIX}-${view.tab}`}
        onReset={props.onReset}
      />
    </section>
  );
}
