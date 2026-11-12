import { MAX_ALERT_IDS } from "@/shared/types/live";

/** The `ids` an alert route passes on: short, plain address-like strings, each once, at most 25. The worker checks them again. */
export function routeIds(request: Request): string[] {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = new Set<string>();
  for (const part of raw.slice(0, 2_000).split(",")) {
    const id = part.trim();
    if (/^[A-Za-z0-9]{2,64}$/.test(id)) ids.add(id);
    if (ids.size >= MAX_ALERT_IDS) break;
  }
  return [...ids];
}

/** Two seconds at the CDN, like the other live views, so visitors watching the same tokens share one worker call. */
export const ALERT_CACHE = { "cache-control": "public, s-maxage=2, stale-while-revalidate=10" };
