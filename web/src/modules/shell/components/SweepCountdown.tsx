"use client";

import { cn } from "@/shared/lib/cn";
import { useSweepCountdown } from "../hooks/useSweepCountdown";
import { STATIC_COUNTDOWN } from "../lib/sweep-clock";

interface SweepCountdownProps {
  className?: string;
}

/**
 * Seconds until the next sweep (0:06 → 0:01). With reduced motion the CSS
 * shows the design's static 0:04 instead.
 */
export function SweepCountdown({ className }: SweepCountdownProps) {
  const label = useSweepCountdown();
  return (
    <>
      <span data-testid="sweep-countdown" className={cn("motion-reduce:hidden", className)}>
        {label}
      </span>
      <span className={cn("hidden motion-reduce:inline", className)}>{STATIC_COUNTDOWN}</span>
    </>
  );
}
