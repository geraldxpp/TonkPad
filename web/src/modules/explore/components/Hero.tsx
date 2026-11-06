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
    <div className="flex min-w-0 flex-[999_1_520px] flex-col justify-center gap-6">
      <div className="inline-flex flex-wrap items-center gap-2 self-start rounded-full border border-line bg-surface py-1.5 pr-3 pl-2.5 text-[12px]">
        <span className="tk-pulse size-2 rounded-full bg-pos" />
        <span className="font-semibold text-text">Live on Solana &amp; Robinhood Chain</span>
        <span className="text-text-3">·</span>
        <span className="text-text-2">{formatInteger(trackedToday)} tokens tracked today</span>
      </div>
      <h1 className="m-0 font-display text-[clamp(40px,5vw,64px)] leading-[1.03] font-extrabold tracking-[-0.03em] text-balance">
        Every launch,
        <br />
        on your{" "}
        <span className="bg-[linear-gradient(90deg,#B8ACFF,#3FD8F0)] bg-clip-text text-transparent">radar.</span>
      </h1>
      <p className="m-0 max-w-[560px] text-[17px] leading-[26px] text-text-2">
        Every new token across Solana and Robinhood Chain — safety-scored, fee-sharing, and one tap from your wallet.
      </p>
      <HeroStats stats={stats} />
      <MissionPick token={pick.token} price={pick.price} updatedSecondsAgo={pick.updatedSecondsAgo} />
    </div>
  );
}
