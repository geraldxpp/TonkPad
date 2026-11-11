"use client";

import { useEffect, useRef, useState } from "react";
import { BridgeApiError, fetchRoutes, type RoutesRequest } from "../lib/api";
import type { BridgeRoute } from "../lib/types";

const DEBOUNCE_MS = 400;
/** Each refresh asks every route again, so it's slower than a swap's. */
export const ROUTES_REFRESH_MS = 20_000;

export interface RoutesState {
  routes: readonly BridgeRoute[];
  loading: boolean;
  /** The server's reason code when the latest answer failed. */
  error: string | null;
  /** The go-live switch, from the latest answer; null before one. */
  tradingOpen: boolean | null;
}

const keyOf = (request: RoutesRequest | null) => (request ? [request.from, request.to, request.asset, request.receive, request.amount, request.sender ?? "", request.recipient ?? "", request.gasTopUp].join("|") : "");

const NONE: readonly BridgeRoute[] = [];

/**
 * Live routes for the transfer (none while there's nothing to quote): asked
 * for once typing settles, refreshed while the page is visible, and dropped
 * the moment the inputs change so a stale figure never shows against new ones.
 */
export function useBridgeRoutes(request: RoutesRequest | null): RoutesState {
  const key = keyOf(request);
  const [state, setState] = useState<{ key: string; routes: readonly BridgeRoute[]; loading: boolean; error: string | null }>({ key: "", routes: NONE, loading: false, error: null });
  const [tradingOpen, setTradingOpen] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0);
  const askedFor = useRef("");

  useEffect(() => {
    const current = request;
    if (!current) return;
    const changed = askedFor.current !== key;
    askedFor.current = key;
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setState((was) => (was.key === key ? { ...was, loading: true } : { key, routes: NONE, loading: true, error: null }));
        try {
          const quote = await fetchRoutes(current, controller.signal);
          setState({ key, routes: quote.routes, loading: false, error: null });
          setTradingOpen(quote.tradingOpen);
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof BridgeApiError && error.tradingOpen !== null) setTradingOpen(error.tradingOpen);
          const code = error instanceof BridgeApiError ? error.code : "unavailable";
          // A failed refresh leaves the last good routes up; a real refusal takes them down.
          setState((was) => ({ key, routes: was.key === key && code !== "too-small" && code !== "too-large" && code !== "no-route" ? was.routes : NONE, loading: false, error: code }));
        }
      },
      changed ? DEBOUNCE_MS : 0,
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // The key holds every field of the request, so it alone decides when to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  useEffect(() => {
    if (!key) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    }, ROUTES_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [key]);

  const fresh = state.key === key && key !== "";
  return { routes: fresh ? state.routes : NONE, loading: fresh ? state.loading : key !== "", error: fresh ? state.error : null, tradingOpen };
}
