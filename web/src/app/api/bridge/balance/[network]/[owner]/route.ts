import { assetOf, isNetworkAddress, networkOf } from "@/modules/bridge/lib/networks";
import { BridgeError, bridgeConfig } from "@/modules/bridge/server/config";
import { errorResponse, jsonResponse, refuseOnTestnet } from "@/modules/bridge/server/request";
import { rpcFor } from "@/modules/bridge/server/rpc";
import { overLimit } from "@/shared/lib/rate-limit";
import { cached } from "@/shared/swap/server/cache";
import { readEvmBalances, readSolanaBalances } from "@/shared/wallet/rpc";

/** A wallet's coin and one asset on any of the bridge's networks: GET /api/bridge/balance/base/<owner>?asset=USDC. */
export async function GET(request: Request, { params }: RouteContext<"/api/bridge/balance/[network]/[owner]">) {
  const limited = overLimit(request, "bridgeBalance");
  if (limited) return limited;
  try {
    refuseOnTestnet();
    const { network: id, owner } = await params;
    const network = networkOf(id);
    if (!network || !isNetworkAddress(network, owner)) throw new BridgeError("invalid", "bad address", 400);
    const symbol = new URL(request.url).searchParams.get("asset");
    const asset = symbol ? assetOf(network, symbol) : null;
    if (symbol && !asset) throw new BridgeError("invalid", "bad asset", 400);
    if (!bridgeConfig().providersOn) throw new BridgeError("unavailable", "providers off");
    const token = asset && !asset.native ? asset.address : null;
    const read = network.vm === "svm" ? readSolanaBalances : readEvmBalances;
    const balances = await cached(`bridge-balance:${network.id}:${owner}:${token ?? ""}`, 8_000, () => read(rpcFor(network), owner, token));
    return jsonResponse({ network: network.id, owner, native: balances.native, token: balances.token, readAt: Date.now() });
  } catch (error) {
    return errorResponse(error);
  }
}
