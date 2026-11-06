"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";

interface CurveBarProps {
  /** Bonding-curve progress, 0–1. */
  value: number;
  /** Track sizing, e.g. "w-[72px] h-1.5" or "flex-auto h-[5px]". */
  className?: string;
}

/** Bonding-curve progress: blue-to-green fill on the empty track colour. */
export function CurveBar({ value, className }: CurveBarProps) {
  const { t } = useI18n();
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <span
      role="meter"
      aria-label={t.table.curve}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("block overflow-hidden rounded-[3px] bg-track", className)}
    >
      <span
        className="block h-full rounded-[3px] bg-[image:var(--gradient-brand)]"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
