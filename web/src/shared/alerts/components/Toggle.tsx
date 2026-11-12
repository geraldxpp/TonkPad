"use client";

import { cn } from "@/shared/lib/cn";

interface ToggleProps {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** An on/off switch: a button with role="switch", so Space and Enter flip it and screen readers say its state. */
export function Toggle({ on, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-5 w-9 flex-none items-center rounded-full border transition-colors disabled:opacity-50",
        on ? "border-accent/60 bg-accent/30" : "border-line-strong bg-raised",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute size-3.5 rounded-full transition-transform", on ? "translate-x-[17px] bg-accent-text" : "translate-x-[2px] bg-text-3")}
      />
    </button>
  );
}
