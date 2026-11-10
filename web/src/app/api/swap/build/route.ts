import { swapConfig, SwapError } from "@/shared/swap/server/config";
import { buildSwap } from "@/shared/swap/server/engine";
import { bodyRecord, errorResponse, jsonResponse, parseSwapRequest } from "@/shared/swap/server/request";

/**
 * A firm quote and the unsigned transaction(s) for the taker's wallet:
 * POST /api/swap/build with the quote's fields and `taker`. Refused (403)
 * until SWAP_TRADING=on.
 */
export async function POST(request: Request) {
  try {
    const swap = parseSwapRequest(await bodyRecord(request));
    if (!swap.taker) throw new SwapError("invalid", "taker required", 400);
    return jsonResponse(await buildSwap({ ...swap, taker: swap.taker }, swapConfig()));
  } catch (error) {
    return errorResponse(error);
  }
}
