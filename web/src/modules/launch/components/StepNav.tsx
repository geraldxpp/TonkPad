"use client";

import { ChevronRight } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { STEPS_ID } from "../hooks/useStudioView";

export interface StepInfo {
  title: string;
  /** What the step is set to, in a few words. */
  sub: string;
}

interface StepNavProps {
  steps: [StepInfo, StepInfo, StepInfo, StepInfo];
  /** The step in view (desktop) or showing (phones). */
  active: number;
  onGo: (step: number) => void;
}

/** The four steps across the top, each with its current setting. On phones they are the flow's tabs. */
export function StepNav({ steps, active, onGo }: StepNavProps) {
  const { t } = useI18n();
  return (
    <nav id={STEPS_ID} aria-label={t.launch.stepsNav} className="mb-6 rounded-xl border border-line bg-surface p-1.5 max-md:mb-4 max-md:scroll-mt-[66px]">
      <ol className="m-0 grid list-none grid-cols-4 gap-1 p-0">
        {steps.map((step, index) => {
          const number = index + 1;
          const current = active === number;
          return (
            <li key={step.title} className="min-w-0">
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => onGo(number)}
                className={cn(
                  "flex size-full min-w-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left max-md:flex-col max-md:items-start max-md:gap-1.5 max-md:px-2",
                  current && "bg-accent/6",
                )}
              >
                <span aria-hidden="true" className={cn("flex size-[26px] flex-none items-center justify-center rounded-lg font-mono text-[11px]", current ? "bg-accent/11 text-accent-text" : "bg-raised text-text-3")}>
                  0{number}
                </span>
                <span className="min-w-0 flex-auto max-md:w-full">
                  <strong className="block text-[13px] leading-[1.3] font-semibold hyphens-auto [overflow-wrap:anywhere] max-md:text-[11px]">{step.title}</strong>
                  <small className="mt-0.5 block truncate text-[11px] text-text-3 max-md:hidden">{step.sub}</small>
                </span>
                {number < 4 ? <ChevronRight size={13} strokeWidth={2} aria-hidden="true" className="flex-none text-line-strong max-lg:hidden" /> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
