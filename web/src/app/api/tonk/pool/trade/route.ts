import { overLimit } from "@/shared/lib/rate-limit";
import { buildPoolTrade, parsePoolTradeRequest } from "@/shared/tonk/server/pool";
import { requireNetwork, tonkErrorResponse, tonkJson } from "@/shared/tonk/server/respond";

/**
 * Builds a trade on a graduated token's Uniswap pool for the trader's
 * wallet: POST /api/tonk/pool/trade. The answer is an exact approval to sign
 * first, the swap itself, or the fresh quote when it moved past the
 * trader's minimum. Nothing is sent.
 */
export async function POST(request: Request) {
  const limited = overLimit(request, "tonkPoolTrade");
  if (limited) return limited;
  try {
    const network = requireNetwork();
    const body: unknown = await request.json().catch(() => null);
    return tonkJson(await buildPoolTrade(network, parsePoolTradeRequest(body)));
  } catch (error) {
    return tonkErrorResponse(error);
  }
}
