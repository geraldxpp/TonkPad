import { networkOf } from "@/modules/bridge/lib/networks";
import { BridgeError } from "@/modules/bridge/server/config";
import { errorResponse, jsonResponse, refuseOnTestnet } from "@/modules/bridge/server/request";
import { isTxHash, sourceState } from "@/modules/bridge/server/status";
import { overLimit } from "@/shared/lib/rate-limit";

/** Whether a transaction on one of the bridge's networks has landed: GET /api/bridge/tx?network=base&tx=<hash>. An approval waits on this. */
export async function GET(request: Request) {
  const limited = overLimit(request, "bridgeStatus");
  if (limited) return limited;
  try {
    refuseOnTestnet();
    const params = new URL(request.url).searchParams;
    const network = networkOf(params.get("network"));
    const tx = params.get("tx") ?? "";
    if (!network || !isTxHash(network, tx)) throw new BridgeError("invalid", "bad transaction", 400);
    return jsonResponse({ state: (await sourceState(network, tx)).state });
  } catch (error) {
    return errorResponse(error);
  }
}
