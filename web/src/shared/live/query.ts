import type { LiveListQuery } from "@/shared/types/live";

/** The query string /v1/list (and the app's /api/live/list) reads, in a fixed key order. */
export function listSearch(query: LiveListQuery): string {
  const { chain, pad, tab, tf, q, limit } = query;
  return new URLSearchParams({ chain, pad, tab, tf, q, limit: String(limit) }).toString();
}
