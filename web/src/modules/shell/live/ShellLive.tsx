"use client";

import { createContext, type ReactNode, useContext } from "react";
import { usePolling } from "@/shared/live/usePolling";
import type { LiveShell } from "@/shared/types/live";

interface ShellLiveValue {
  /** True when the app runs on the live-data worker (WORKER_URL is set). */
  live: boolean;
  /** The latest ticker, chain counts and status; null until the first response. */
  data: LiveShell | null;
}

const ShellLiveContext = createContext<ShellLiveValue>({ live: false, data: null });

/** Polls /api/live/shell every 10 s in live mode; mock mode never fetches. */
export function ShellLiveProvider({ live, children }: { live: boolean; children: ReactNode }) {
  const { data } = usePolling<LiveShell | null>(live ? "/api/live/shell" : null, null, 10_000);
  return <ShellLiveContext value={{ live, data }}>{children}</ShellLiveContext>;
}

export function useShellLive(): ShellLiveValue {
  return useContext(ShellLiveContext);
}
