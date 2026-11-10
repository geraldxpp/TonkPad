"use client";

import { ArrowDown, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/shared/i18n/I18nProvider";
import type { ExploreData } from "../data/get-explore-data";
import { HeroStats } from "./HeroStats";
import { NativeCoin } from "./NativeCoin";

/** The token list's id: "Explore the market" scrolls to it. */
export const DISCOVERY_ID = "token-discovery";

/**
 * The overview: eyebrow, headline, subtitle and the two calls to action beside
 * the slot reserved for tonkfun.fun's own coin, then the four market numbers.
 * Under 1024 px the coin card drops below the text.
 */
export function Hero({ stats }: { stats: ExploreData["stats"] }) {
  const { t, href } = useI18n();
  // "Find your next {accent}": each language puts the highlighted word where it belongs.
  const [lead, tail = ""] = t.hero.headline.split("{accent}");
  return (
    <section aria-label={t.hero.overview} className="flex flex-col gap-5">
      <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(270px,1fr)]">
        <div className="flex min-w-0 flex-col justify-center">
          <p className="mb-3 flex items-center gap-2.5 text-[10px] font-semibold tracking-[0.2em] text-accent-text uppercase">
            <span aria-hidden="true" className="h-px w-6 bg-accent" />
            {t.hero.eyebrow}
          </p>
          <h1 className="font-display text-[clamp(36px,3.6vw,54px)] leading-[1.07] font-extrabold tracking-[-0.045em]">
            {lead}
            <span className="text-accent-text">{t.hero.accent}</span>
            {tail}
          </h1>
          <p className="mt-3 max-w-[520px] text-[14px] leading-[22px] text-text-2">{t.hero.subtitle}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={`#${DISCOVERY_ID}`}
              className="inline-flex h-10 items-center gap-3 rounded-lg bg-cta px-4 text-[13px] font-semibold text-on-cta hover:brightness-110"
            >
              {t.hero.explore}
              <ArrowDown size={15} strokeWidth={2} aria-hidden="true" />
            </a>
            <Link
              href={href("/launch")}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[13px] font-medium text-text-2 hover:text-text"
            >
              {t.hero.launch}
              <ArrowUpRight size={15} strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <NativeCoin />
      </div>
      <HeroStats stats={stats} />
    </section>
  );
}
