import { listSearch } from "@/shared/live/query";
import type { LiveListQuery } from "@/shared/types/live";

/** Rows per page of the live token list; Load more adds a page up to the worker's cap. */
export const LIVE_PAGE_SIZE = 10;
export const LIVE_MAX_ROWS = 50;

/** How often the browser refreshes the screen (the table footer promises 4 s). */
export const LIVE_REFRESH_MS = 4_000;

/** The app's own endpoints the browser polls; they proxy the worker (app/api/live). */
export const LIVE_OVERVIEW_URL = "/api/live/overview";

export function liveListUrl(query: LiveListQuery): string {
  return `/api/live/list?${listSearch(query)}`;
}
