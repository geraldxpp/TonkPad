import { Suspense } from "react";
import { getI18n } from "@/shared/i18n/server";
import { FindToken } from "./FindToken";
import { LatestLaunches } from "./LatestLaunches";
import { TestnetLater } from "./TestnetLater";

const CARD = "flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 max-md:p-4";
const TITLE = "font-display text-[20px] leading-6 font-bold tracking-[-0.02em]";

/**
 * Explore on the testnet site, before its tokens are indexed: the "not on
 * testnet yet" note, then the two ways to reach a token that already exist
 * there: its address, and the launchpad's latest launches.
 */
export async function TestnetExplore() {
  const { t } = await getI18n();
  const f = t.mission.find;
  return (
    <div className="flex w-full max-w-[640px] flex-col gap-5 max-md:gap-4">
      <TestnetLater title={t.meta.explore} />
      <section aria-labelledby="find-token-title" className={CARD}>
        <h2 id="find-token-title" className={TITLE}>
          {f.title}
        </h2>
        <FindToken />
      </section>
      <section aria-labelledby="latest-launches-title" className={CARD}>
        <h2 id="latest-launches-title" className={TITLE}>
          {f.latest}
        </h2>
        <Suspense fallback={<div className="min-h-16" />}>
          <LatestLaunches />
        </Suspense>
      </section>
    </div>
  );
}
