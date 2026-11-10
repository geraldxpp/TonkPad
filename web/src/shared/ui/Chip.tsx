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

/** Small toggle used for the launchpad filters: a cyan tint when selected, a quiet hover otherwise. */
export function Chip({ label, count, mark, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 flex-none items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium whitespace-nowrap",
        active
          ? "border-accent/25 bg-accent/8 text-accent-text"
          : "border-transparent text-text-2 hover:bg-raised hover:text-text",
      )}
    >
      {mark}
      {label}
      {count ? <span className="font-mono text-[11px] font-normal text-text-3">{count}</span> : null}
    </button>
  );
}
