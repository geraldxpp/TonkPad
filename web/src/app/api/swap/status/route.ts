import { isChainId } from "@/shared/config/chains";
import { overLimit } from "@/shared/lib/rate-limit";
import { SwapError } from "@/shared/swap/server/config";
import { errorResponse, jsonResponse, refuseOnTestnet } from "@/shared/swap/server/request";
import { isTxId, transactionState } from "@/shared/swap/server/send";

/** Where a swap's transaction stands: GET /api/swap/status?chain=sol&tx=<signature>. */
export async function GET(request: Request) {
  const limited = overLimit(request, "status");
  if (limited) return limited;
  try {
    refuseOnTestnet();
    const params = new URL(request.url).searchParams;
    const chain = params.get("chain");
    const tx = params.get("tx") ?? "";
    if (!isChainId(chain) || !isTxId(chain, tx)) throw new SwapError("invalid", "bad transaction id", 400);
    return jsonResponse({ state: await transactionState(chain, tx) });
  } catch (error) {
    return errorResponse(error);
  }
}
