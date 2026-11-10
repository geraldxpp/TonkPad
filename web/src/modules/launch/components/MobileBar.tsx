"use client";

import { ArrowRight, ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";

interface MobileBarProps {
  step: number;
  /** "0.255 ETH": the total so far. */
  total: string;
  onBack: () => void;
  onNext: () => void;
  /** On the last step, the main button takes Continue's place. */
  action: ReactNode;
}

/** Phones: a fixed bar above the tab bar with the step, the total, Back and Continue (the main button on step 4). */
export function MobileBar({ step, total, onBack, onNext, action }: MobileBarProps) {
  const { t } = useI18n();
  const l = t.launch;
  return (
    <div data-testid="launch-bar" className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 flex items-center gap-2.5 border-t border-line bg-bg-deep/95 px-4 py-3 backdrop-blur-md md:hidden">
      <div className="flex min-w-0 flex-auto flex-col">
        <span className="text-[11px] text-text-3">{fmt(l.stepOf, { step })}</span>
        <span className="truncate font-mono text-[14px] font-semibold">
          {total} <small className="font-sans text-[10px] font-normal text-text-3">{l.summary.gas}</small>
        </span>
      </div>
      <button type="button" onClick={onBack} disabled={step === 1} aria-label={l.back} className="inline-flex size-11 flex-none items-center justify-center rounded-lg border border-line-strong bg-raised disabled:opacity-40">
        <ChevronLeft size={17} strokeWidth={2} aria-hidden="true" />
      </button>
      {step < 4 ? (
        <button type="button" onClick={onNext} className="inline-flex min-h-11 flex-none items-center gap-2 rounded-lg bg-cta px-4 text-[13px] font-semibold text-on-cta">
          {l.next}
          <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : (
        <div className="max-w-[58%] flex-none">{action}</div>
      )}
    </div>
  );
}
