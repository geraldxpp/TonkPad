"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { usePolling } from "@/shared/live/usePolling";
import type { LiveOverview } from "@/shared/types/live";
import type { LiveExploreData } from "../data/get-live-explore-data";
import { LIVE_OVERVIEW_URL, LIVE_REFRESH_MS } from "../lib/live";
import { ExploreLoading } from "./ExploreLoading";
import { HeatingUp } from "./HeatingUp";
import { Hero } from "./Hero";
import { LiveScope } from "./LiveScope";
import { LiveTokenList } from "./LiveTokenList";

interface ExploreLiveProps {
  /** What the server fetched for this request; null when the worker couldn't be reached. */
  initial: LiveExploreData | null;
  /** The list URL `initial.list` answers. */
  initialListUrl: string;
}

/** The Explore screen on live data: everything above the list refreshes every 4 s, and so does the list. */
export function ExploreLive({ initial, initialListUrl }: ExploreLiveProps) {
  const { t } = useI18n();
  const { data: overview, error } = usePolling<LiveOverview | null>(
    LIVE_OVERVIEW_URL,
    initial?.overview ?? null,
    LIVE_REFRESH_MS,
    initial ? LIVE_OVERVIEW_URL : null,
  );
  if (!overview) return <ExploreLoading offline={error} />;
  return (
    <>
      <section aria-label={t.hero.overview} className="flex flex-wrap items-stretch gap-8 max-md:gap-6">
        <Hero stats={overview.stats} trackedToday={overview.totalTokens} />
        <LiveScope blips={overview.blips} scope={overview.scope} />
      </section>
      {overview.heating.length > 0 ? <HeatingUp cards={overview.heating} /> : null}
      <LiveTokenList
        initial={initial?.list ?? null}
        initialUrl={initial ? initialListUrl : null}
        overview={overview}
      />
    </>
  );
}
