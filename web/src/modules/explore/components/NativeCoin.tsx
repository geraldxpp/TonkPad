"use client";

import { Rocket } from "lucide-react";
import { Logo } from "@/modules/shell/components/Logo";
import { useI18n } from "@/shared/i18n/I18nProvider";

/** The coin's display name; a brand name, so it isn't translated. */
const NAME = "Tonkpad";

/**
 * The hero's featured slot, reserved for Tonkpad's own coin (it replaces the
 * reference's Mission Pick, at the owner's request). Until the coin launches
 * it shows the Tonkpad emblem with "Coming soon"; then it can show the coin
 * with MissionPick's price, market cap, 24h and Buy.
 */
export function NativeCoin() {
  const { t } = useI18n();
  return (
    <section
      aria-label={t.native.title}
      className="flex flex-wrap items-center gap-4 rounded-[18px] border border-line bg-surface p-3.5"
    >
      <span className="flex-none">
        <Logo size={52} />
      </span>
      <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-accent-text">
          <Rocket size={13} strokeWidth={2} aria-hidden="true" />
          <span className="uppercase">{t.native.label}</span>
        </span>
        <span className="text-[17px] font-semibold text-text">{NAME}</span>
      </div>
      {/* Phones: full width under the name, where the featured Buy sits. */}
      <span className="inline-flex h-11 items-center justify-center rounded-[14px] border border-accent/40 bg-accent/14 px-5 text-[15px] font-semibold whitespace-nowrap text-accent-text max-md:h-12 max-md:basis-full">
        {t.native.soon}
      </span>
    </section>
  );
}
