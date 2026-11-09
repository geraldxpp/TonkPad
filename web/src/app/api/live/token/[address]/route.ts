import { getLiveTokenData } from "@/modules/token/data/get-live-token-data";

/** Only a validated address is forwarded. Worker credentials never leave the server. */
export async function GET(_request: Request, { params }: RouteContext<"/api/live/token/[address]">) {
  const { address } = await params;
  const result = await getLiveTokenData(address);
  if (result.status === "ok") {
    return Response.json(result.detail, { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=10" } });
  }
  return Response.json(
    { error: result.status === "not-found" ? "not found" : "live data unavailable" },
    { status: result.status === "not-found" ? 404 : 502, headers: { "cache-control": "no-store" } },
  );
}
