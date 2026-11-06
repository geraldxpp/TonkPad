"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { applyParamUpdates, type ParamUpdates, serializeParams } from "@/shared/lib/url-params";

/**
 * Reads view state from the URL and writes it back with history.replaceState,
 * which Next.js syncs into useSearchParams without a server round trip.
 * Components that call this must sit inside a <Suspense> boundary.
 */
export function useUrlParams() {
  const params = useSearchParams();

  const setParams = useCallback((updates: ParamUpdates) => {
    const next = applyParamUpdates(window.location.search, updates);
    const url = `${window.location.pathname}${serializeParams(next)}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, []);

  return { params, setParams };
}
