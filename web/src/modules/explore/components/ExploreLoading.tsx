"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";

function Block({ className }: { className: string }) {
  return <div aria-hidden="true" className={cn("tk-skeleton bg-raised", className)} />;
}

const CARDS = [0, 1, 2, 3, 4, 5];

/**
 * Placeholders shaped like the Explore screen (hero with the coin card and
 * market strip, the spotlight row, then the token list) while its live data
 * loads, so nothing jumps when it arrives. `offline` says the worker can't be
 * reached yet (the screen keeps retrying).
 */
export function ExploreLoading({ offline = false }: { offline?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-7">
      <p role="status" className={offline ? "m-0 text-[13px] text-text-2" : "sr-only"}>
        {offline ? t.live.offline : t.live.loading}
      </p>
      <div className="flex flex-col gap-5">
        <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(270px,1fr)]">
          <div className="flex min-w-0 flex-col justify-center gap-3">
            <Block className="h-3 w-40 rounded-full" />
            <Block className="h-[clamp(40px,3.9vw,58px)] w-[min(560px,90%)] rounded-xl max-md:h-[78px]" />
            <Block className="h-11 w-[min(520px,100%)] rounded-lg" />
            <div className="mt-1 flex gap-3">
              <Block className="h-10 w-44 rounded-lg" />
              <Block className="h-10 w-36 rounded-lg" />
            </div>
          </div>
          <Block className="min-h-[180px] rounded-2xl max-md:min-h-[128px]" />
        </div>
        <Block className="h-[146px] rounded-xl md:h-[66px]" />
      </div>
      <div className="flex flex-col gap-4">
        <Block className="h-12 w-64 max-w-full rounded-lg" />
        <div className="flex gap-4 overflow-hidden max-md:gap-3">
          {CARDS.map((i) => (
            <Block key={i} className="h-[172px] w-[272px] flex-none rounded-xl max-md:w-[248px]" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Block className="h-12 w-72 max-w-full rounded-lg" />
        <Block className="h-[640px] w-full rounded-2xl" />
      </div>
    </div>
  );
}
