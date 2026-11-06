"use client";

import { useMemo, useState } from "react";
import { ChainFilter } from "@/modules/shell/components/ChainFilter";
import { usePolling } from "@/shared/live/usePolling";
import type { LiveList } from "@/shared/types/live";
import type { ExploreOverview } from "../data/get-explore-data";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useListControls } from "../hooks/useListControls";
import type { RankedToken } from "../lib/filter";
import { LIVE_MAX_ROWS, LIVE_PAGE_SIZE, LIVE_REFRESH_MS, liveListUrl } from "../lib/live";
import { TokenListView } from "./TokenListView";

interface LiveTokenListProps {
  /** The first page the server rendered for the URL's view, from `initialUrl`; null if it couldn't. */
  initial: LiveList | null;
  initialUrl: string | null;
  overview: Pick<ExploreOverview, "launchpads" | "moreLaunchpads" | "chainCounts">;
}

/**
 * The live token list. The worker filters and sorts; this asks for the view
 * in the URL and refreshes it every 4 s. Load more adds a page; a new view
 * starts again from one page. Searches wait for a pause in typing.
 */
export function LiveTokenList({ initial, initialUrl, overview }: LiveTokenListProps) {
  const { view, handlers } = useListControls();
  const q = useDebouncedValue(view.q, 250);
  const viewKey = [view.chain, view.pad, view.tab, view.tf, q].join("|");
  const [pages, setPages] = useState({ viewKey, count: 1 });
  const count = pages.viewKey === viewKey ? pages.count : 1;
  const limit = Math.min(count * LIVE_PAGE_SIZE, LIVE_MAX_ROWS);

  const url = liveListUrl({ chain: view.chain, pad: view.pad, tab: view.tab, tf: view.tf, q, limit });
  const { data, loading } = usePolling<LiveList | null>(url, initial, LIVE_REFRESH_MS, initialUrl);
  const rows = useMemo<RankedToken[]>(() => (data?.rows ?? []).map((token, i) => ({ ...token, rank: i + 1 })), [data]);

  return (
    <TokenListView
      {...handlers}
      rows={rows}
      view={view}
      launchpads={overview.launchpads}
      moreLaunchpads={overview.moreLaunchpads}
      totalTokens={data?.total ?? 0}
      chainControl={<ChainFilter counts={overview.chainCounts} compact />}
      busy={loading || data === null}
      hasMore={data !== null && data.matched > rows.length && limit < LIVE_MAX_ROWS}
      onLoadMore={() => setPages({ viewKey, count: count + 1 })}
    />
  );
}
