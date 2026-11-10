"use client";

import { useId } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { SLIPPAGE_OPTIONS } from "@/shared/swap/slippage";
import { bpsPct } from "../../lib/curve-text";

/** The slippage the minimum is worked out from: the Swap screen's own setting, shared with it. */
export function SlippagePicker({ value, onChange }: { value: number; onChange: (bps: number) => void }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[11px] text-text-3">
      <span id={id}>{t.token.trade.slippage}</span>
      <div role="group" aria-labelledby={id} className="flex gap-1">
        {SLIPPAGE_OPTIONS.map((bps) => (
          <button
            key={bps}
            type="button"
            aria-pressed={value === bps}
            onClick={() => onChange(bps)}
            className={cn("min-h-7 rounded-md border px-2 font-mono text-[11px]", value === bps ? "border-accent/45 bg-accent/8 text-accent-text" : "border-line bg-raised text-text-2")}
          >
            {bpsPct(bps)}
          </button>
        ))}
      </div>
    </div>
  );
}
