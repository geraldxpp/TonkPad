import { overLimit } from "@/shared/lib/rate-limit";
import { address, invalid, wei } from "@/shared/tonk/server/build";
import { quotePool } from "@/shared/tonk/server/pool";
import { requireNetwork, tonkErrorResponse, tonkJson } from "@/shared/tonk/server/respond";

/**
 * What a graduated token's Uniswap pool gives now for an exact amount in,
 * from Uniswap's own V4Quoter: GET /api/tonk/pool/quote?token=…&side=buy|sell&amount=<wei>.
 * Nothing is built.
 */
export async function GET(request: Request) {
  const limited = overLimit(request, "tonkPoolQuote");
  if (limited) return limited;
  try {
    const network = requireNetwork();
    const params = new URL(request.url).searchParams;
    const side = params.get("side");
    if (side !== "buy" && side !== "sell") throw invalid("side");
    return tonkJson(await quotePool(network, address(params.get("token"), "token"), side, wei(params.get("amount"), "amount")));
  } catch (error) {
    return tonkErrorResponse(error);
  }
}
