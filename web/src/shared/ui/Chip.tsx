import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface ChipProps {
  label: string;
  /** Mono count shown after the label, already formatted. */
  count?: string;
  /** Leading mark, e.g. a PadMark. */
  mark?: ReactNode;
  active: boolean;
  onClick?: () => void;
}

/** Pill toggle used for the launchpad filters. */
export function Chip({ label, count, mark, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-2xl border pr-3 text-[13px] font-medium whitespace-nowrap",
        mark ? "pl-2" : "pl-3",
        active
          ? "border-accent/55 bg-accent/14 text-text"
          : "border-line bg-surface text-text-2",
      )}
    >
      {mark}
      {label}
      {count ? <span className="font-mono text-[12px] font-normal text-text-3">{count}</span> : null}
    </button>
  );
}
