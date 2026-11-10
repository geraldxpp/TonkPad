import { cached } from "@/shared/swap/server/cache";
import { swapConfig } from "@/shared/swap/server/config";
import { quoteSwap } from "@/shared/swap/server/engine";
import { errorResponse, jsonResponse, parseSwapRequest, queryRecord } from "@/shared/swap/server/request";

/**
 * An indicative quote: GET /api/swap/quote?chain=sol&from=<mint>&to=<mint>&amount=<raw>&slippageBps=100[&taker=<wallet>].
 * Identical requests within a few seconds share one upstream call.
 */
export async function GET(request: Request) {
  try {
    const swap = parseSwapRequest(queryRecord(request));
    const key = `quote:${swap.chain}:${swap.from}:${swap.to}:${swap.amount}:${swap.slippageBps}:${swap.taker ?? ""}`;
    const quote = await cached(key, 4_000, () => quoteSwap(swap, swapConfig()));
    return jsonResponse(quote);
  } catch (error) {
    // The go-live switch rides along, so the page knows trading is closed even when no quote comes back.
    return errorResponse(error, { tradingOpen: swapConfig().tradingOpen });
  }
}
