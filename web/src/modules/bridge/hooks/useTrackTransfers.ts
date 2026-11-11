"use client";

import { useEffect, useRef } from "react";
import { fetchStatus } from "../lib/api";
import { inFlight, updateTransfer } from "../lib/recent";
import type { RecentTransfer } from "../lib/types";

const TICK_MS = 3_000;

/** How often a transfer is checked: closely at first, then less as it ages. */
export function checkEvery(ageMs: number): number {
  if (ageMs < 180_000) return 3_000;
  if (ageMs < 1_800_000) return 10_000;
  return 60_000;
}

/**
 * Follows every transfer still on its way, for as long as the page is open
 * and visible. Recent is the record, so a reload (or a second tab) picks up
 * where this left off, and nothing is ever sent again.
 */
export function useTrackTransfers(transfers: readonly RecentTransfer[]) {
  const latest = useRef(transfers);
  const checked = useRef(new Map<string, number>());
  useEffect(() => {
    latest.current = transfers;
  });
  const active = transfers.some(inFlight);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const pass = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      for (const transfer of latest.current) {
        if (!inFlight(transfer)) continue;
        if (now - (checked.current.get(transfer.id) ?? 0) < checkEvery(now - transfer.at)) continue;
        checked.current.set(transfer.id, now);
        fetchStatus(transfer).then(
          (status) => {
            // A network that doesn't answer reads as "still confirming": that never takes a transfer back a step.
            if (stopped || (transfer.state === "transit" && status.state === "source")) return;
            if (status.state !== transfer.state || status.destinationTx !== transfer.destinationTx) updateTransfer(transfer.id, status);
          },
          () => undefined,
        );
      }
    };
    pass();
    const timer = window.setInterval(pass, TICK_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [active]);
}
