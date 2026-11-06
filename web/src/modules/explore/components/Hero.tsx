import { formatInteger } from "@/shared/lib/format";
import type { ExploreData } from "../data/get-explore-data";
import { HeroStats } from "./HeroStats";
import { MissionPick } from "./MissionPick";

interface HeroProps {
  stats: ExploreData["stats"];
  trackedToday: number;
  pick: ExploreData["missionPick"];
}

export function Hero({ stats, trackedToday, pick }: HeroProps) {
  return (
    <div className="flex min-w-0 flex-[999_1_480px] flex-col justify-center gap-6 max-md:gap-5">
      <div className="inline-flex flex-wrap items-center gap-2 self-start rounded-full border border-line bg-surface py-1.5 pr-3 pl-2.5 text-[12px]">
        <span className="tk-pulse size-2 rounded-full bg-pos" />
        <span className="font-semibold text-text">Live on Solana &amp; Robinhood Chain</span>
        {/* The stats right below repeat this count, so phones keep the pill to one line. */}
        <span className="text-text-3 max-md:hidden">·</span>
        <span className="text-text-2 max-md:hidden">{formatInteger(trackedToday)} tokens tracked today</span>
      </div>
      <h1 className="m-0 font-display text-[clamp(44px,5.2vw,72px)] leading-none font-extrabold tracking-[-0.03em]">
        Launches<span className="text-neon">.</span>
      </h1>
      <p className="m-0 max-w-[560px] text-[17px] leading-[26px] text-text-2 max-md:text-[15px] max-md:leading-[23px]">
        Every new token across Solana and Robinhood Chain, from every major launchpad.
      </p>
      <HeroStats stats={stats} />
      <MissionPick token={pick.token} price={pick.price} updatedSecondsAgo={pick.updatedSecondsAgo} />
    </div>
  );
}
