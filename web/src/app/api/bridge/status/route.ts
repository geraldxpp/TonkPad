import { networkOf, isNetworkAddress } from "@/modules/bridge/lib/networks";
import { bridgeConfig, BridgeError } from "@/modules/bridge/server/config";
import { errorResponse, jsonResponse, refuseOnTestnet } from "@/modules/bridge/server/request";
import { isProvider, isTxHash, transferStatus } from "@/modules/bridge/server/status";
import { overLimit } from "@/shared/lib/rate-limit";

const REQUEST_ID = /^0x[\da-fA-F]{64}$/;
const TOOL = /^[\w-]{1,40}$/;

/** Where a transfer stands: GET /api/bridge/status?from=base&to=rh&tx=…&provider=relay&requestId=…&sender=…&raw=…. */
export async function GET(request: Request) {
  const limited = overLimit(request, "bridgeStatus");
  if (limited) return limited;
  try {
    refuseOnTestnet();
    const params = new URL(request.url).searchParams;
    const from = networkOf(params.get("from"));
    const to = networkOf(params.get("to"));
    const tx = params.get("tx") ?? "";
    const provider = params.get("provider");
    const requestId = params.get("requestId");
    const tool = params.get("tool");
    const sender = params.get("sender") ?? "";
    const raw = params.get("raw") ?? "";
    if (!from || !to || !isTxHash(from, tx) || !isProvider(provider) || !isNetworkAddress(from, sender) || !/^\d{1,60}$/.test(raw)) throw new BridgeError("invalid", "bad transfer", 400);
    if ((requestId !== null && !REQUEST_ID.test(requestId)) || (tool !== null && !TOOL.test(tool))) throw new BridgeError("invalid", "bad transfer", 400);
    return jsonResponse(await transferStatus({ from, to, tx, provider, requestId, tool, sender, raw }, bridgeConfig()));
  } catch (error) {
    return errorResponse(error);
  }
}
