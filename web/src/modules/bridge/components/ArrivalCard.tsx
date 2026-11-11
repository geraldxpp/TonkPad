"use client";

import { ArrowUpRight, Navigation } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/shared/i18n/I18nProvider";

/** "From arrived to ready.": the three steps of a transfer, and where to go next. */
export function ArrivalCard({ nextHref, nextLabel }: { nextHref: string | null; nextLabel: string }) {
  const { t, href } = useI18n();
  const a = t.bridge.arrival;
  const steps: [string, string][] = [
    [a.step1Title, a.step1Body],
    [a.step2Title, a.step2Body],
    [a.step3Title, a.step3Body],
  ];
  return (
    <section aria-labelledby="bridge-arrival-title" className="px-[3px] pt-[5px]">
      <div className="flex items-center gap-2.5">
        <span className="flex size-[33px] flex-none items-center justify-center rounded-[9px] bg-accent/7 text-accent-text">
          <Navigation size={16} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <div>
          <h2 id="bridge-arrival-title" className="font-display text-[16px] font-bold tracking-[-0.3px]">
            {a.title}
          </h2>
          <p className="m-0 mt-1 text-[11px] text-text-3">{a.sub}</p>
        </div>
      </div>
      <ol className="my-[23px] ml-[7px] list-none p-0 max-[999px]:grid max-[999px]:grid-cols-3 max-[999px]:gap-4 max-[599px]:block">
        {steps.map(([title, body], index) => (
          <li key={title} className="relative flex gap-[13px] pb-5 not-last:before:absolute not-last:before:top-[25px] not-last:before:bottom-0 not-last:before:left-3 not-last:before:w-px not-last:before:bg-line last:pb-0 max-[999px]:pb-0 max-[999px]:before:hidden max-[599px]:pb-[22px] max-[599px]:before:block max-[599px]:last:pb-0">
            <span className="flex size-[25px] flex-none items-center justify-center rounded-full border border-line-strong font-mono text-[10px] text-text-3">{index + 1}</span>
            <div>
              <strong className="block text-[11px] font-semibold">{title}</strong>
              <small className="mt-[3px] block text-[10px] text-text-3">{body}</small>
            </div>
          </li>
        ))}
      </ol>
      {nextHref ? (
        <Link href={href(nextHref)} className="flex items-center justify-between rounded border-t border-line pt-[13px] text-[11px] text-text-2 hover:text-text">
          {nextLabel}
          <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}
