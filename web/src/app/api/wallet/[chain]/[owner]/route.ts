import { isChainId } from "@/shared/config/chains";
import { isChainAddress } from "@/shared/lib/address";
import { overLimit } from "@/shared/lib/rate-limit";
import { readWalletBalances } from "@/shared/wallet/server";

const NO_STORE = { "cache-control": "no-store" };

/**
 * A wallet's coin and its holding of one token: GET /api/wallet/sol/<owner>?token=<mint>.
 * Only addresses in the chain's own format get through, and the provider
 * keys stay on the server. Balances are public on-chain data, so the CDN may
 * share a response for a few seconds; past that, each client's reads are rate-limited.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/wallet/[chain]/[owner]">) {
  const limited = overLimit(request, "balances");
  if (limited) return limited;
  const { chain, owner } = await params;
  const token = new URL(request.url).searchParams.get("token");
  if (!isChainId(chain) || !isChainAddress(chain, owner) || (token !== null && !isChainAddress(chain, token))) {
    return Response.json({ error: "invalid address" }, { status: 400, headers: NO_STORE });
  }
  try {
    const balances = await readWalletBalances(chain, owner, token);
    return Response.json(balances, { headers: { "cache-control": "public, s-maxage=5, stale-while-revalidate=10" } });
  } catch {
    return Response.json({ error: "balances unavailable" }, { status: 502, headers: NO_STORE });
  }
}
