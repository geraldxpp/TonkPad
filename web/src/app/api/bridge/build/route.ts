import { bridgeConfig, BridgeError } from "@/modules/bridge/server/config";
import { buildBridge } from "@/modules/bridge/server/engine";
import { bodyRecord, errorResponse, jsonResponse, parseBridgeRequest, refuseOnTestnet } from "@/modules/bridge/server/request";
import { overLimit } from "@/shared/lib/rate-limit";

/**
 * The transaction(s) for the wallet to sign, for the route the person chose:
 * POST /api/bridge/build with the quote's fields, `routeId` and `reviewedOut`.
 * Refused (403) until BRIDGE_TRADING=on. It holds no key and sends nothing.
 */
export async function POST(request: Request) {
  const limited = overLimit(request, "bridgeBuild");
  if (limited) return limited;
  try {
    refuseOnTestnet();
    const body = await bodyRecord(request);
    const input = parseBridgeRequest(body);
    const { routeId, reviewedOut } = body;
    if (typeof routeId !== "string" || typeof reviewedOut !== "string" || !/^\d{1,60}$/.test(reviewedOut)) throw new BridgeError("invalid", "bad route", 400);
    return jsonResponse(await buildBridge(input, routeId, reviewedOut, bridgeConfig()));
  } catch (error) {
    return errorResponse(error);
  }
}
