import { swapConfig } from "@/shared/swap/server/config";
import { jsonResponse } from "@/shared/swap/server/request";

/** Whether real swaps are open (the SWAP_TRADING switch): GET /api/swap/open → { tradingOpen }. */
export function GET() {
  return jsonResponse({ tradingOpen: swapConfig().tradingOpen }, 30);
}
