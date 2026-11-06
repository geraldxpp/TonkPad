"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";

function Block({ className }: { className: string }) {
  return <div aria-hidden="true" className={cn("tk-skeleton bg-raised", className)} />;
}

/**
 * Placeholders shaped like the Explore screen while its live data loads, so
 * nothing jumps when it arrives. `offline` says the worker can't be reached
 * yet (the screen keeps retrying).
 */
export function ExploreLoading({ offline = false }: { offline?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-14 max-md:gap-9">
      <p role="status" className={offline ? "m-0 text-[13px] text-text-2" : "sr-only"}>
        {offline ? t.live.offline : t.live.loading}
      </p>
      <div className="flex flex-wrap items-stretch gap-8 max-md:gap-6">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col justify-center gap-6 max-md:gap-5">
          <Block className="h-8 w-60 max-w-full rounded-full" />
          <Block className="h-[clamp(44px,5.2vw,72px)] w-[min(420px,80%)] rounded-2xl" />
          <Block className="h-[52px] w-[min(560px,100%)] rounded-xl" />
          <Block className="h-14 w-full max-w-[640px] rounded-xl" />
          <Block className="h-[92px] w-full max-w-[640px] rounded-[20px]" />
        </div>
        <Block className="h-[440px] min-w-0 max-w-[520px] flex-[1_1_360px] rounded-3xl max-lg:max-w-none" />
      </div>
      <div className="flex flex-col gap-4">
        <Block className="h-8 w-56 rounded-xl" />
        <div className="flex gap-4 overflow-hidden max-md:gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Block key={i} className="h-[320px] w-[244px] flex-none rounded-[22px] max-md:h-[296px] max-md:w-[172px]" />
          ))}
        </div>
      </div>
      <Block className="h-[560px] w-full rounded-[20px]" />
    </div>
  );
}
