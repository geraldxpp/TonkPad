"use client";

import { useEffect, useState } from "react";
import { fetchLaunchStatus } from "@/shared/tonk/api";
import type { LaunchedMission, LaunchTxState } from "@/shared/tonk/types";

const POLL_MS = 2_000;
/** A hash the chain has never heard of is given this long to appear before it counts as dropped or replaced. */
const UNKNOWN_FOR_MS = 90_000;

export interface LaunchTxView {
  /** "checking" before the first answer; "confirmed" only with a successful receipt. */
  state: LaunchTxState | "checking";
  mission: LaunchedMission | null;
  /** The last check couldn't reach the chain; it keeps trying. */
  unreachable: boolean;
}

const START: LaunchTxView = { state: "checking", mission: null, unreachable: false };

/**
 * Watches a launch's transaction by its hash until it settles: confirmed,
 * failed, or replaced in the wallet. It only reads, so reloading the page (or
 * opening the link elsewhere) resumes the watch and never sends anything.
 */
export function useLaunchTx(hash: string | null): LaunchTxView {
  const [view, setView] = useState<{ hash: string | null } & LaunchTxView>({ hash, ...START });

  useEffect(() => {
    if (!hash) return;
    let stopped = false;
    let timer = 0;
    const started = Date.now();
    const check = async () => {
      try {
        const status = await fetchLaunchStatus(hash);
        if (stopped) return;
        const lost = status.state === "unknown" && Date.now() - started > UNKNOWN_FOR_MS;
        const state: LaunchTxState = lost ? "replaced" : status.state;
        setView({ hash, state, mission: status.mission, unreachable: false });
        if (state === "pending" || state === "unknown") timer = window.setTimeout(check, POLL_MS);
      } catch {
        if (stopped) return;
        setView((prev) => ({ ...(prev.hash === hash ? prev : { hash, ...START }), unreachable: true }));
        timer = window.setTimeout(check, POLL_MS * 2);
      }
    };
    void check();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [hash]);

  return view.hash === hash ? view : START;
}
