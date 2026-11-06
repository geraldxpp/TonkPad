"use client";

import { useEffect, useState } from "react";

interface PollState<T> {
  data: T;
  /** The URL `data` came from. */
  url: string | null;
  /** True when the latest request failed (the last good data stays). */
  failed: boolean;
}

/**
 * Fetches JSON from `url` and again every `intervalMs` while the tab is
 * visible (and as soon as it becomes visible again). `initial` is what the
 * server rendered for `initialUrl`, so that first fetch is skipped. On an error
 * the last good data stays. `loading` is true while a new URL's first response
 * is outstanding. Pass `url: null` to switch polling off.
 */
export function usePolling<T>(url: string | null, initial: T, intervalMs: number, initialUrl: string | null = null) {
  const [state, setState] = useState<PollState<T>>({ data: initial, url: initialUrl, failed: false });

  useEffect(() => {
    if (!url) return;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const res = await fetch(url, { signal: current.signal, headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as T;
        setState({ data, url, failed: false });
      } catch {
        // Offline or the worker is down: keep the last good data. An abort is not a failure.
        if (!current.signal.aborted) setState((prev) => (prev.failed ? prev : { ...prev, failed: true }));
      }
    };
    if (state.url !== url) void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      controller?.abort();
    };
    // `state.url` is read only to skip a fetch the server already made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, intervalMs]);

  return { data: state.data, loading: url !== null && state.url !== url, error: state.failed };
}
