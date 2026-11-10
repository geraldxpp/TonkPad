"use client";

import { useEffect, useState } from "react";
import { fetchLaunchStatus } from "./api";
import type { TxEventJson } from "./mission";
import type { LaunchedMission, LaunchTxState } from "./types";

const POLL_MS = 2_000;
/** A hash the chain has never heard of is given this long to appear before it counts as dropped or replaced. */
const UNKNOWN_FOR_MS = 90_000;

export interface TxView {
  /** "checking" before the first answer; "confirmed" only with a successful receipt. */
  state: LaunchTxState | "checking";
  /** The mission it launched, when it was a launch. */
  mission: LaunchedMission | null;
  /** What it did, once confirmed: a trade, a claim, an extension… */
  events: TxEventJson[];
  /** The last check couldn't reach the chain; it keeps trying. */
  unreachable: boolean;
}

const START: TxView = { state: "checking", mission: null, events: [], unreachable: false };

/**
 * Watches a transaction by its hash until it settles: confirmed, failed, or
 * replaced in the wallet. It only reads, so reloading the page (or opening
 * the link elsewhere) resumes the watch and never sends anything.
 */
export function useTxStatus(hash: string | null): TxView {
  const [view, setView] = useState<{ hash: string | null } & TxView>({ hash, ...START });

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
        setView({ hash, state, mission: status.mission, events: status.events, unreachable: false });
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

/** Waits for a transaction to settle, for a step inside a longer run (an approval before a sell). */
export async function settled(hash: string, timeoutMs = 120_000): Promise<{ state: LaunchTxState; events: TxEventJson[] }> {
  const started = Date.now();
  for (;;) {
    const status = await fetchLaunchStatus(hash).catch(() => null);
    if (status && status.state !== "pending" && status.state !== "unknown") return status;
    if (Date.now() - started > timeoutMs) return { state: status?.state ?? "unknown", events: [] };
    await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
  }
}
