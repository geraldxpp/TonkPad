import { readPortfolio } from "@/modules/portfolio/server/read";
import { isChainId } from "@/shared/config/chains";
import { isChainAddress } from "@/shared/lib/address";
import { overLimit } from "@/shared/lib/rate-limit";
import { isTestnetSite } from "@/shared/tonk/networks";

const NO_STORE = { "cache-control": "no-store" };

/**
 * Everything a wallet holds on one chain: GET /api/portfolio/sol/<owner>.
 * Only addresses in the chain's own format get through, and the provider
 * keys stay on the server. Holdings are public on-chain data, so the CDN may
 * share a response for a few seconds. Closed on the testnet site, whose
 * tokens have no market to price them.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/portfolio/[chain]/[owner]">) {
  const limited = overLimit(request, "portfolio");
  if (limited) return limited;
  if (isTestnetSite()) return Response.json({ error: "closed" }, { status: 404, headers: NO_STORE });
  const { chain, owner } = await params;
  if (!isChainId(chain) || !isChainAddress(chain, owner)) return Response.json({ error: "invalid address" }, { status: 400, headers: NO_STORE });
  try {
    return Response.json(await readPortfolio(chain, owner), { headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=20" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502, headers: NO_STORE });
  }
}
