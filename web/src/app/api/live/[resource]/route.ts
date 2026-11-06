import { fetchWorkerText } from "@/shared/live/server";

const RESOURCES = new Set(["list", "overview", "shell"]);

/**
 * /api/live/list|overview|shell → the worker's /v1 JSON. The CDN keeps each
 * response for 2 s, so every visitor polling the same view shares one call.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/live/[resource]">) {
  const { resource } = await params;
  if (!RESOURCES.has(resource)) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const body = await fetchWorkerText(`/v1/${resource}${new URL(request.url).search}`);
    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, s-maxage=2, stale-while-revalidate=10",
      },
    });
  } catch {
    return Response.json({ error: "live data unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
