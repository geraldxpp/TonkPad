import { bridgeConfig } from "@/modules/bridge/server/config";
import { quoteBridge } from "@/modules/bridge/server/engine";
import { errorResponse, jsonResponse, parseBridgeRequest, queryRecord, refuseOnTestnet } from "@/modules/bridge/server/request";
import { overLimit } from "@/shared/lib/rate-limit";
import { cached } from "@/shared/swap/server/cache";

/**
 * Every route for a transfer, compared: GET /api/bridge/quote?from=base&to=rh&asset=USDC&receive=USDG&amount=<raw>[&sender=…&recipient=…&gasTopUp=1].
 * Identical requests within a few seconds share one round of provider calls.
 */
export async function GET(request: Request) {
  const limited = overLimit(request, "bridgeQuote");
  if (limited) return limited;
  try {
    refuseOnTestnet();
    const input = parseBridgeRequest(queryRecord(request));
    const key = `bridge:${input.from.id}:${input.to.id}:${input.asset.symbol}:${input.receive.symbol}:${input.amount}:${input.sender}:${input.recipient}:${input.gasTopUp}`;
    return jsonResponse(await cached(key, 8_000, () => quoteBridge(input, bridgeConfig())));
  } catch (error) {
    // The go-live switch rides along, so the page knows transfers are closed even when no route comes back.
    return errorResponse(error, { tradingOpen: bridgeConfig().tradingOpen });
  }
}
