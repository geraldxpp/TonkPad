import { readActivity } from "@/modules/portfolio/server/read";
import { isChainId } from "@/shared/config/chains";
import { isChainAddress } from "@/shared/lib/address";
import { overLimit } from "@/shared/lib/rate-limit";
import { isTestnetSite } from "@/shared/tonk/networks";

const NO_STORE = { "cache-control": "no-store" };
/** A Solana signature or a block number: nothing else is passed to a provider. */
const CURSOR = /^(?:[1-9A-HJ-NP-Za-km-z]{64,90}|\d{1,12})$/;

/** A page of a wallet's history on one chain: GET /api/portfolio/sol/<owner>/activity?cursor=…. */
export async function GET(request: Request, { params }: RouteContext<"/api/portfolio/[chain]/[owner]/activity">) {
  const limited = overLimit(request, "portfolioActivity");
  if (limited) return limited;
  if (isTestnetSite()) return Response.json({ error: "closed" }, { status: 404, headers: NO_STORE });
  const { chain, owner } = await params;
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (!isChainId(chain) || !isChainAddress(chain, owner) || (cursor !== null && !CURSOR.test(cursor))) return Response.json({ error: "invalid address" }, { status: 400, headers: NO_STORE });
  try {
    return Response.json(await readActivity(chain, owner, cursor), { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=30" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502, headers: NO_STORE });
  }
}
