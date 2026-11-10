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
  /**
   * "xs" is the token list's mono timeframe, "sm" a small switch, "md" the
   * default, "panel" a toolbar group, "toggle" the token card's Price / MCap
   * and "chart" the chart's borderless timeframes.
   */
  size?: "xs" | "sm" | "md" | "panel" | "toggle" | "chart";
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
  const xs = size === "xs";
  const sm = size === "sm";
  const panel = size === "panel";
  const toggle = size === "toggle";
  const chart = size === "chart";
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex gap-0.5",
        !chart && "border border-line",
        xs
          ? "rounded-md bg-raised p-0.5"
          : sm
            ? "rounded-[10px] bg-raised p-[3px]"
            : panel
              ? "flex-wrap rounded-xl bg-raised p-1"
              : toggle
                ? "rounded-lg bg-bg p-[3px]"
                : chart
                  ? "flex-wrap"
                  : "rounded-xl bg-surface p-1",
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
              "font-medium disabled:cursor-not-allowed disabled:opacity-50",
              xs || chart ? "font-mono text-[11px]" : toggle ? "text-[11px]" : "text-[13px]",
              xs
                ? "h-7 rounded px-2.5"
                : chart
                  ? "h-7 min-w-[31px] rounded-[5px] px-[7px] max-md:min-w-7 max-md:px-[5px]"
                  : toggle
                    ? "h-[26px] rounded-[5px] px-2.5"
                    : tight
                      ? "px-[11px]"
                      : "px-3",
              // The timeframe pills tighten a little on phones to share a row with the filters.
              xs || chart || toggle ? undefined : sm ? "h-[26px] rounded-lg" : panel ? "h-[30px] rounded-lg" : "h-8 rounded-[9px] max-md:px-2.5",
              active
                ? chart
                  ? "bg-accent/10 text-accent-text"
                  : "bg-input text-text"
                : cn("bg-transparent", xs || chart || toggle ? "text-text-3 hover:text-text" : "text-text-2"),
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
