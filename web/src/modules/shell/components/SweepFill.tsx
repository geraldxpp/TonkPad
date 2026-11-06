"use client";

import { useRef } from "react";
import { useSweepSync } from "../hooks/useSweepSync";

/** Status-bar progress that fills 0 → 100% once per sweep. Static 62% with reduced motion. */
export function SweepFill() {
  const ref = useRef<HTMLSpanElement>(null);
  useSweepSync(ref);
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="h-1 w-16 overflow-hidden rounded-[2px] bg-line-strong"
    >
      <span className="tk-fill block h-full w-full bg-[image:var(--gradient-brand)] motion-reduce:w-[62%]" />
    </span>
  );
}
