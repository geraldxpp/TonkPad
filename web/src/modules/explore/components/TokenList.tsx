"use client";

import { useCallback, useMemo } from "react";
import type { Token } from "@/shared/types/token";
import { useExploreView } from "../hooks/useExploreView";
import { filterTokens } from "../lib/filter";
import { TOKEN_TAB_PREFIX } from "./ListToolbar";
import { TokenListView, type TokenListViewProps } from "./TokenListView";

type TokenListProps = Pick<TokenListViewProps, "launchpads" | "moreLaunchpads" | "totalTokens"> & {
  tokens: Token[];
};

/** The token list bound to the URL: tabs, timeframe, launchpad, chain and search. */
export function TokenList({ tokens, ...rest }: TokenListProps) {
  const { view, update, reset } = useExploreView();
  const rows = useMemo(() => filterTokens(tokens, view), [tokens, view]);

  const onReset = useCallback(() => {
    reset();
    // The Reset button disappears with the empty state, so hand focus to the tabs.
    requestAnimationFrame(() => document.getElementById(`${TOKEN_TAB_PREFIX}-trending`)?.focus());
  }, [reset]);

  return (
    <TokenListView
      {...rest}
      rows={rows}
      view={view}
      onTab={(tab) => update({ tab })}
      onTimeframe={(tf) => update({ tf })}
      onPad={(pad) => update({ pad })}
      onReset={onReset}
    />
  );
}
