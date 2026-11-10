"use client";

import { Logo } from "@/modules/shell/components/Logo";
import { useI18n } from "@/shared/i18n/I18nProvider";

/** The coin's display name; a brand name, so it isn't translated. */
const NAME = "tonkfun.fun";

/**
 * The hero's featured card, reserved for tonkfun.fun's own coin (it replaces
 * the reference's Mission Pick, at the owner's request). Until the coin
 * launches it shows the rounded T with "Coming soon"; then it can show the
 * coin with MissionPick's price, market cap, 24h and Buy.
 */
export function NativeCoin() {
  const { t } = useI18n();
  return (
    <section
      aria-label={t.native.title}
      className="relative isolate flex min-h-[180px] items-center justify-between gap-4 overflow-hidden rounded-2xl border border-accent/20 bg-surface p-6 max-md:min-h-0 max-md:p-4"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(ellipse_at_95%_15%,rgb(var(--accent-rgb)/0.17),transparent_65%)]"
      />
      <div className="relative z-[1] flex min-w-0 flex-col items-start">
        <span className="mb-3 rounded-md border border-accent/25 bg-accent/8 px-2 py-1 text-[9px] font-semibold tracking-[0.12em] text-accent-text uppercase">
          {t.native.label}
        </span>
        <span className="font-display text-[28px] leading-8 font-extrabold tracking-[-0.04em]">{NAME}</span>
        <p className="mt-2 max-w-44 text-[12px] leading-[18px] text-text-2">{t.native.tagline}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-text">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
          {t.native.soon}
        </span>
      </div>
      <div aria-hidden="true" className="relative flex h-36 w-28 flex-none items-center justify-center max-md:h-24 max-md:w-20">
        <div className="absolute size-36 rotate-[30deg] rounded-[28px] border border-accent/10 max-md:size-24" />
        <div className="absolute size-28 rotate-[30deg] rounded-[22px] border border-accent/15 max-md:size-20" />
        <span className="rotate-[-8deg] drop-shadow-[0_0_22px_rgb(var(--accent-rgb)/0.35)]">
          <Logo size={76} />
        </span>
      </div>
    </section>
  );
}
