"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SwapQuote } from "@/shared/types/swap";
import { fetchQuote, type QuoteRequest, SwapApiError } from "./api";

/** How long typing settles before a quote is asked for, and how often a quote refreshes while the page is visible. */
const DEBOUNCE_MS = 350;
export const QUOTE_REFRESH_MS = 15_000;

export interface QuoteState {
  quote: SwapQuote | null;
  loading: boolean;
  /** The server's reason code when the latest quote failed. */
  error: string | null;
  /** Whether swaps are open (the go-live switch), from the latest answer; null before one. */
  tradingOpen: boolean | null;
  refresh: () => void;
}

const keyOf = (request: QuoteRequest | null) =>
  request ? [request.chain, request.from, request.to, request.amount, request.slippageBps, request.taker ?? ""].join("|") : "";

/**
 * A live quote for the request (null while there's nothing to quote): asked
 * for once typing settles, refreshed every 15 s while the page is visible,
 * and dropped the moment the pair or amount changes so a stale number never
 * shows against new inputs.
 */
export function useQuote(request: QuoteRequest | null): QuoteState {
  const key = keyOf(request);
  const [state, setState] = useState<{ key: string; quote: SwapQuote | null; loading: boolean; error: string | null }>({
    key: "",
    quote: null,
    loading: false,
    error: null,
  });
  const [tradingOpen, setTradingOpen] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0);
  const askedFor = useRef("");

  useEffect(() => {
    const current = request;
    if (!current) return;
    // New inputs wait for typing to settle; a refresh of the same inputs goes straight away.
    const changed = askedFor.current !== key;
    askedFor.current = key;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState((was) => (was.key === key ? { ...was, loading: true } : { key, quote: null, loading: true, error: null }));
      try {
        const quote = await fetchQuote(current, controller.signal);
        setState({ key, quote, loading: false, error: null });
        setTradingOpen(quote.tradingOpen);
      } catch (error) {
        if (controller.signal.aborted) return;
        const code = error instanceof SwapApiError ? error.code : "unavailable";
        if (error instanceof SwapApiError && error.tradingOpen !== null) setTradingOpen(error.tradingOpen);
        setState((was) => ({ key, quote: was.key === key ? was.quote : null, loading: false, error: code }));
      }
    }, changed ? DEBOUNCE_MS : 0);
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
    }, QUOTE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [key]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const fresh = state.key === key && key !== "";
  return { quote: fresh ? state.quote : null, loading: fresh ? state.loading : key !== "", error: fresh ? state.error : null, tradingOpen, refresh };
}
