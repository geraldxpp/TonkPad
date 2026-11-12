"use client";

import { useEffect, useState } from "react";
import { type IndexerView, indexerViewOf } from "../lib/indexer";

/** The worker's view changes with trades; every 15 seconds while the page is visible is plenty. */
const REFRESH_MS = 15_000;

/**
 * What the live-data worker knows about a tonkfun.fun launch that the chain
 * can't answer in one read: its holders, its top traders and the top-10
 * share, from `/api/live/token/<address>`. Anything but a well-formed answer
 * for this address says "unavailable": never a stand-in, and never the last
 * answer passed off as the current one. Off (`enabled` false), it stays as
 * it is, for the testnet site, where there is no indexer yet.
 */
export function useIndexer(address: string, enabled: boolean): IndexerView {
  const [view, setView] = useState<IndexerView>({ status: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let pending: AbortController | null = null;
    const load = async () => {
      if (pending) return;
      const controller = new AbortController();
      pending = controller;
      try {
        const response = await fetch(`/api/live/token/${encodeURIComponent(address)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
        const body: unknown = response.ok ? await response.json() : null;
        if (!disposed) setView(indexerViewOf(body, address));
      } catch {
        if (!disposed && !controller.signal.aborted) setView({ status: "unavailable" });
      } finally {
        if (pending === controller) pending = null;
      }
    };
    void load();
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refreshVisible, REFRESH_MS);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      disposed = true;
      pending?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [address, enabled]);
  return view;
}
