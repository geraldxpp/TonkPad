import { overLimit } from "@/shared/lib/rate-limit";
import { requireNetwork, tonkErrorResponse, tonkJson } from "@/shared/tonk/server/respond";
import { buildTrade, parseTradeRequest } from "@/shared/tonk/server/trade";

/**
 * Builds a curve buy or sell for the trader's wallet: POST /api/tonk/trade.
 * The call is simulated from the trader's address first; the answer is an
 * unsigned transaction, an approval to sign first, or the fresh state when
 * the price has moved past the trader's minimum. Nothing is sent.
 */
export async function POST(request: Request) {
  const limited = overLimit(request, "tonkTrade");
  if (limited) return limited;
  try {
    const network = requireNetwork();
    const body: unknown = await request.json().catch(() => null);
    return tonkJson(await buildTrade(network, parseTradeRequest(body)));
  } catch (error) {
    return tonkErrorResponse(error);
  }
}
