import { isChainId } from "@/shared/config/chains";
import { isChainAddress } from "@/shared/lib/address";
import { SwapError } from "@/shared/swap/server/config";
import { errorResponse, jsonResponse } from "@/shared/swap/server/request";
import { tokenInfo } from "@/shared/swap/server/token-info";

/** A token's symbol, name, decimals and art, for a pasted address: GET /api/swap/token?chain=rh&address=0x… */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const chain = params.get("chain");
    const address = params.get("address") ?? "";
    if (!isChainId(chain) || !isChainAddress(chain, address)) throw new SwapError("invalid", "bad address", 400);
    const token = await tokenInfo(chain, address);
    if (!token) throw new SwapError("no-route", "unknown token", 404);
    return jsonResponse(token, 300);
  } catch (error) {
    return errorResponse(error);
  }
}
