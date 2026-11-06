"use client";

import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatInteger } from "@/shared/lib/format";
import type { ExploreData } from "../data/get-explore-data";
import { HeroStats } from "./HeroStats";
import { MissionPick } from "./MissionPick";

interface HeroProps {
  stats: ExploreData["stats"];
  trackedToday: number;
  /** null while the live worker has no candidate yet. */
  pick: ExploreData["missionPick"] | null;
}

/** Live pill, headline, subtitle, the four stats and the Mission Pick. */
export function Hero({ stats, trackedToday, pick }: HeroProps) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 flex-[999_1_480px] flex-col justify-center gap-6 max-md:gap-5">
      <div className="inline-flex flex-wrap items-center gap-2 self-start rounded-full border border-line bg-surface py-1.5 pr-3 pl-2.5 text-[12px]">
        <span className="tk-pulse size-2 rounded-full bg-pos" />
        <span className="font-semibold text-text">{t.hero.live}</span>
        {/* The stats right below repeat this count, so phones keep the pill to one line. */}
        <span className="text-text-3 max-md:hidden">·</span>
        <span className="text-text-2 max-md:hidden">{fmt(t.hero.tracked, { count: formatInteger(trackedToday) })}</span>
      </div>
      <h1 className="m-0 font-display text-[clamp(44px,5.2vw,72px)] leading-none font-extrabold tracking-[-0.03em]">
        {t.hero.title}
        <span className="text-neon">.</span>
      </h1>
      <p className="m-0 max-w-[560px] text-[17px] leading-[26px] text-text-2 max-md:text-[15px] max-md:leading-[23px]">
        {t.hero.subtitle}
      </p>
      <HeroStats stats={stats} />
      {pick ? <MissionPick token={pick.token} price={pick.price} updatedSecondsAgo={pick.updatedSecondsAgo} /> : null}
    </div>
  );
}
