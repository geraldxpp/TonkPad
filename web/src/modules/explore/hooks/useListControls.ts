"use client";

import { useCallback, useMemo } from "react";
import { TOKEN_TAB_PREFIX } from "../components/ListToolbar";
import type { ExploreView, TabId, Timeframe } from "../lib/view";
import { useExploreView } from "./useExploreView";

/** The token list's view and its tab, timeframe, launchpad and reset handlers, bound to the URL. */
export function useListControls() {
  const { view, update, reset } = useExploreView();

  const onReset = useCallback(() => {
    reset();
    // The Reset button disappears with the empty state, so hand focus to the tabs.
    requestAnimationFrame(() => document.getElementById(`${TOKEN_TAB_PREFIX}-trending`)?.focus());
  }, [reset]);

  const handlers = useMemo(
    () => ({
      onTab: (tab: TabId) => update({ tab }),
      onTimeframe: (tf: Timeframe) => update({ tf }),
      onPad: (pad: ExploreView["pad"]) => update({ pad }),
      onReset,
    }),
    [update, onReset],
  );

  return { view, handlers };
}
