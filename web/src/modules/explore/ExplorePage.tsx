import { connection } from "next/server";
import { Suspense } from "react";
import { ChainTrigger } from "@/modules/shell/components/ChainTrigger";
import { getI18n } from "@/shared/i18n/server";
import { isLiveMode } from "@/shared/live/server";
import { ExploreLive } from "./components/ExploreLive";
import { ExploreLoading } from "./components/ExploreLoading";
import { HeatingUp } from "./components/HeatingUp";
import { Hero } from "./components/Hero";
import { LiveScope } from "./components/LiveScope";
import { TokenList } from "./components/TokenList";
import { TokenListView } from "./components/TokenListView";
import { type ExploreData, getExploreData } from "./data/get-explore-data";
import { getLiveExploreData } from "./data/get-live-explore-data";
import { filterTokens } from "./lib/filter";
import { LIVE_PAGE_SIZE, liveListUrl } from "./lib/live";
import { DEFAULT_VIEW, paramsFromRecord, parseView } from "./lib/view";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface ExplorePageProps {
  searchParams: SearchParams;
}

type ListData = Pick<ExploreData, "tokens" | "launchpads" | "moreLaunchpads" | "totalTokens" | "chainCounts">;

/**
 * Awaiting the request's search params makes this a request-time hole, so a
 * shared link (?tab=locked…) arrives already filtered. Client-side changes
 * after that come from the URL via useSearchParams.
 */
async function RequestTokenList({ searchParams, data }: { searchParams: SearchParams; data: ListData }) {
  await searchParams;
  return <TokenList {...data} />;
}

/** Live mode: the worker's data for this request's view, then the browser keeps it fresh. */
async function LiveExplore({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // Live data is never prerendered: fetch it per request.
  await connection();
  const view = parseView(paramsFromRecord(params));
  const query = { ...view, limit: LIVE_PAGE_SIZE };
  const initial = await getLiveExploreData(query);
  return <ExploreLive initial={initial} initialListUrl={liveListUrl(query)} />;
}

/**
 * Module 1: Explore. With the live-data worker (WORKER_URL set) the whole
 * screen streams in at request time behind a loading skeleton. On mock data
 * everything above the token list is prerendered and the list streams in at
 * request time; the static shell carries the default view.
 */
export async function ExplorePage({ searchParams }: ExplorePageProps) {
  if (isLiveMode()) {
    return (
      <Suspense fallback={<ExploreLoading />}>
        <LiveExplore searchParams={searchParams} />
      </Suspense>
    );
  }
  const [data, { t }] = await Promise.all([getExploreData(), getI18n()]);
  const list = {
    launchpads: data.launchpads,
    moreLaunchpads: data.moreLaunchpads,
    totalTokens: data.totalTokens,
  };
  const fallback = (
    <TokenListView
      {...list}
      rows={filterTokens(data.tokens, DEFAULT_VIEW)}
      view={DEFAULT_VIEW}
      chainControl={<ChainTrigger value="all" compact aria-expanded={false} />}
    />
  );
  return (
    <>
      <section aria-label={t.hero.overview} className="flex flex-wrap items-stretch gap-8 max-md:gap-6">
        <Hero stats={data.stats} trackedToday={data.totalTokens} pick={data.missionPick} />
        <LiveScope blips={data.blips} scope={data.scope} />
      </section>
      <HeatingUp cards={data.heating} />
      <Suspense fallback={fallback}>
        <RequestTokenList
          searchParams={searchParams}
          data={{ ...list, tokens: data.tokens, chainCounts: data.chainCounts }}
        />
      </Suspense>
    </>
  );
}
