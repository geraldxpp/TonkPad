import { ALERT_CACHE, routeIds } from "@/shared/alerts/server";
import { fetchWorkerText, isLiveMode } from "@/shared/live/server";
import { tonkMode } from "@/shared/tonk/networks";

/**
 * GET /api/live/launches?ids=… → tonkfun.fun's launches as they stand (the
 * newest, then those asked for), what the launchpad alerts compare between
 * checks. From the worker's indexer in live mode; none in the demo.
 */
export async function GET(request: Request) {
  if (tonkMode() === "testnet") return Response.json({ error: "closed" }, { status: 404 });
  if (!isLiveMode()) return Response.json({ launches: [] }, { headers: { "cache-control": "no-store" } });
  const ids = routeIds(request);
  try {
    const body = await fetchWorkerText(`/v1/launches${ids.length > 0 ? `?ids=${encodeURIComponent(ids.join(","))}` : ""}`);
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", ...ALERT_CACHE } });
  } catch {
    return Response.json({ error: "live data unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
