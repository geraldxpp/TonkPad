import { Suspense } from "react";
import { HeatingUp } from "./components/HeatingUp";
import { Hero } from "./components/Hero";
import { LiveScope } from "./components/LiveScope";
import { TokenList } from "./components/TokenList";
import { TokenListView } from "./components/TokenListView";
import { type ExploreData, getExploreData } from "./data/get-explore-data";
import { filterTokens } from "./lib/filter";
import { DEFAULT_VIEW } from "./lib/view";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface ExplorePageProps {
  searchParams: SearchParams;
}

type ListData = Pick<ExploreData, "tokens" | "launchpads" | "moreLaunchpads" | "totalTokens">;

/**
 * Awaiting the request's search params makes this a request-time hole, so a
 * shared link (?tab=locked…) arrives already filtered. Client-side changes
 * after that come from the URL via useSearchParams.
 */
async function RequestTokenList({ searchParams, data }: { searchParams: SearchParams; data: ListData }) {
  await searchParams;
  const { tokens, ...list } = data;
  return <TokenList {...list} tokens={tokens} />;
}

/**
 * Module 1: Explore. Everything above the token list is prerendered. The list
 * streams in at request time; the static shell carries the default view.
 */
export async function ExplorePage({ searchParams }: ExplorePageProps) {
  const data = await getExploreData();
  const list = {
    launchpads: data.launchpads,
    moreLaunchpads: data.moreLaunchpads,
    totalTokens: data.totalTokens,
  };
  return (
    <>
      <section aria-label="Overview" className="flex flex-wrap items-stretch gap-8">
        <Hero stats={data.stats} trackedToday={data.totalTokens} pick={data.missionPick} />
        <LiveScope blips={data.blips} subtitle={data.scopeSubtitle} />
      </section>
      <HeatingUp cards={data.heating} />
      <Suspense fallback={<TokenListView {...list} rows={filterTokens(data.tokens, DEFAULT_VIEW)} view={DEFAULT_VIEW} />}>
        <RequestTokenList searchParams={searchParams} data={{ ...list, tokens: data.tokens }} />
      </Suspense>
    </>
  );
}
