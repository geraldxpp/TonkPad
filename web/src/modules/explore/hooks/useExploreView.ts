"use client";

import { useCallback, useMemo } from "react";
import { useUrlParams } from "@/modules/shell/hooks/useUrlParams";
import { type ExploreView, parseView, RESET_PATCH, viewUpdates } from "../lib/view";

/** The token-list view, read from and written to the URL. */
export function useExploreView() {
  const { params, setParams } = useUrlParams();
  const view = useMemo(() => parseView(params), [params]);

  const update = useCallback((patch: Partial<ExploreView>) => setParams(viewUpdates(patch)), [setParams]);
  const reset = useCallback(() => setParams(viewUpdates(RESET_PATCH)), [setParams]);

  return { view, update, reset };
}
