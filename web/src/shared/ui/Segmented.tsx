import { cn } from "@/shared/lib/cn";

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  label: string;
  /** "sm" is the Live scope switch, "md" the table timeframe. */
  size?: "sm" | "md";
}

/** A row of toggle buttons where exactly one is pressed. */
export function Segmented<T extends string>({ options, value, onChange, label, size = "md" }: SegmentedProps<T>) {
  const sm = size === "sm";
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex gap-0.5 border border-line",
        sm ? "rounded-[10px] bg-raised p-[3px]" : "rounded-xl bg-surface p-1",
      )}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange?.(option.id)}
            className={cn(
              "px-3 text-[13px] font-medium",
              sm ? "h-[26px] rounded-lg" : "h-8 rounded-[9px]",
              active ? "bg-input text-text" : "bg-transparent text-text-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
