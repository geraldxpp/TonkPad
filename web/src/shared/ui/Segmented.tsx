import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
  /** Optional leading icon (decorative; the label names the option). */
  icon?: ReactNode;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  label: string;
  /** "sm" is the Live scope switch, "md" the table timeframe, "panel" the token chart's toolbar groups. */
  size?: "sm" | "md" | "panel";
  /** 11 px side padding instead of 12 (the chart's timeframes). */
  tight?: boolean;
  /** Stretch to the container's width with equal buttons (the Settings theme switch). */
  fill?: boolean;
}

/** A row of toggle buttons where exactly one is pressed. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  tight = false,
  fill = false,
}: SegmentedProps<T>) {
  const sm = size === "sm";
  const panel = size === "panel";
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex gap-0.5 border border-line",
        sm ? "rounded-[10px] bg-raised p-[3px]" : panel ? "flex-wrap rounded-xl bg-raised p-1" : "rounded-xl bg-surface p-1",
        fill && "w-full",
      )}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            disabled={option.disabled}
            aria-pressed={active}
            onClick={() => onChange?.(option.id)}
            className={cn(
              "text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50",
              tight ? "px-[11px]" : "px-3",
              // The timeframe pills tighten a little on phones to share a row with the filters.
              sm ? "h-[26px] rounded-lg" : panel ? "h-[30px] rounded-lg" : "h-8 rounded-[9px] max-md:px-2.5",
              active ? "bg-input text-text" : "bg-transparent text-text-2",
              fill && "flex-1",
              option.icon ? "inline-flex items-center justify-center gap-1.5" : undefined,
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
