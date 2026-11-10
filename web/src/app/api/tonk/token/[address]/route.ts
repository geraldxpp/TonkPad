import { isEvmAddress } from "@/shared/lib/address";
import { overLimit } from "@/shared/lib/rate-limit";
import { TonkError } from "@/shared/tonk/server/client";
import { readMissionPage } from "@/shared/tonk/server/mission";
import { requireNetwork, tonkErrorResponse, tonkJson } from "@/shared/tonk/server/respond";

/** A mission's state and its newest trades, straight from the chain: GET /api/tonk/token/<address>. */
export async function GET(request: Request, { params }: RouteContext<"/api/tonk/token/[address]">) {
  const limited = overLimit(request, "tonkToken");
  if (limited) return limited;
  try {
    const network = requireNetwork();
    const { address } = await params;
    if (!isEvmAddress(address)) throw new TonkError("invalid", "bad address", 400);
    return tonkJson(await readMissionPage(network, address), 2);
  } catch (error) {
    return tonkErrorResponse(error);
  }
}
