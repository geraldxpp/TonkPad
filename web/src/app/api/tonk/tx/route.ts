import { overLimit } from "@/shared/lib/rate-limit";
import { TonkError } from "@/shared/tonk/server/client";
import { requireNetwork, tonkErrorResponse, tonkJson } from "@/shared/tonk/server/respond";
import { launchStatus } from "@/shared/tonk/server/status";
import { isTxHash } from "@/shared/tonk/types";

/** Where a launch transaction stands, and the mission it launched: GET /api/tonk/tx?hash=0x…. */
export async function GET(request: Request) {
  const limited = overLimit(request, "tonkTx");
  if (limited) return limited;
  try {
    const network = requireNetwork();
    const hash = new URL(request.url).searchParams.get("hash") ?? "";
    if (!isTxHash(hash)) throw new TonkError("invalid", "bad transaction hash", 400);
    return tonkJson(await launchStatus(network, hash as `0x${string}`));
  } catch (error) {
    return tonkErrorResponse(error);
  }
}
