"use client";

import { useEffect, useState } from "react";
import { formatCountdown, secondsToNextSweep, SWEEP_MS } from "../lib/sweep-clock";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

function timelineNow(): number {
  const time = document.timeline?.currentTime;
  return typeof time === "number" ? time : performance.now();
}

/** "0:06" → "0:01", in step with the sweep. Starts at "0:06" on the server. */
export function useSweepCountdown(): string {
  const reduced = usePrefersReducedMotion();
  const [label, setLabel] = useState(formatCountdown(SWEEP_MS / 1000));

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    let last = "";
    const tick = () => {
      const next = formatCountdown(secondsToNextSweep(timelineNow()));
      if (next !== last) {
        last = next;
        setLabel(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  return label;
}
