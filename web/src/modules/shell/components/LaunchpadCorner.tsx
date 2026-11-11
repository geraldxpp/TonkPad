import { Suspense } from "react";
import { getI18n } from "@/shared/i18n/server";
import { FindToken } from "./FindToken";
import { LatestLaunches } from "./LatestLaunches";

const CARD = "flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-6 max-md:p-4";
const TITLE = "font-display text-[20px] leading-6 font-bold tracking-[-0.02em]";

/**
 * On mainnet Explore, until the live feed lists tonkfun.fun's own launches:
 * the launchpad's latest launches, read from its events, and any launch by
 * its address.
 */
export async function LaunchpadCorner() {
  const { t } = await getI18n();
  const f = t.mission.find;
  return (
    <div className="grid w-full gap-5 max-md:gap-4 lg:grid-cols-2">
      <section aria-labelledby="latest-launches-title" className={CARD}>
        <h2 id="latest-launches-title" className={TITLE}>
          {f.latestLive}
        </h2>
        <Suspense fallback={<div className="min-h-16" />}>
          <LatestLaunches />
        </Suspense>
      </section>
      <section aria-labelledby="find-token-title" className={CARD}>
        <h2 id="find-token-title" className={TITLE}>
          {f.title}
        </h2>
        <FindToken />
      </section>
    </div>
  );
}
