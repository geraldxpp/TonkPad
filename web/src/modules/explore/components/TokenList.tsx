"use client";

import { useMemo } from "react";
import { ChainFilter } from "@/modules/shell/components/ChainFilter";
import type { Token } from "@/shared/types/token";
import type { ExploreData } from "../data/get-explore-data";
import { useListControls } from "../hooks/useListControls";
import { filterTokens } from "../lib/filter";
import { TokenListView, type TokenListViewProps } from "./TokenListView";

type TokenListProps = Pick<TokenListViewProps, "launchpads" | "moreLaunchpads" | "totalTokens"> & {
  tokens: Token[];
  chainCounts: ExploreData["chainCounts"];
};

/** The mock token list bound to the URL: tabs, timeframe, launchpad, chain and search. */
export function TokenList({ tokens, chainCounts, ...rest }: TokenListProps) {
  const { view, handlers } = useListControls();
  const rows = useMemo(() => filterTokens(tokens, view), [tokens, view]);
  return (
    <TokenListView
      {...rest}
      {...handlers}
      rows={rows}
      view={view}
      chainControl={<ChainFilter counts={chainCounts} compact />}
    />
  );
}
