import { listSearch } from "@/shared/live/query";
import { fetchWorker } from "@/shared/live/server";
import type { LiveList, LiveListQuery, LiveOverview } from "@/shared/types/live";

export interface LiveExploreData {
  overview: LiveOverview;
  list: LiveList;
}

/**
 * The Explore screen from the live-data worker: the overview and the first
 * page of the list for `query`. null when the worker can't be reached; the
 * browser then keeps polling until it can.
 */
export async function getLiveExploreData(query: LiveListQuery): Promise<LiveExploreData | null> {
  try {
    const [overview, list] = await Promise.all([
      fetchWorker<LiveOverview>("/v1/overview"),
      fetchWorker<LiveList>(`/v1/list?${listSearch(query)}`),
    ]);
    return { overview, list };
  } catch {
    return null;
  }
}
