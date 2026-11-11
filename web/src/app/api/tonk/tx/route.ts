import { overLimit } from "@/shared/lib/rate-limit";
import { TonkError } from "@/shared/tonk/server/client";
import { requireNetwork, tonkErrorResponse, tonkJson } from "@/shared/tonk/server/respond";
import { launchStatus } from "@/shared/tonk/server/status";
import { isTxHash, type TxSender } from "@/shared/tonk/types";

/** The sender and nonce an earlier answer gave, sent back by the page; anything malformed is ignored. */
function senderOf(params: URLSearchParams): TxSender | null {
  const from = params.get("from") ?? "";
  const nonce = params.get("nonce") ?? "";
  return /^0x[0-9a-fA-F]{40}$/.test(from) && /^\d{1,12}$/.test(nonce) ? { from: from as `0x${string}`, nonce: Number(nonce) } : null;
}

/** Where a transaction stands, and the mission it launched: GET /api/tonk/tx?hash=0x…[&from=0x…&nonce=…]. */
export async function GET(request: Request) {
  const limited = overLimit(request, "tonkTx");
  if (limited) return limited;
  try {
    const network = requireNetwork();
    const params = new URL(request.url).searchParams;
    const hash = params.get("hash") ?? "";
    if (!isTxHash(hash)) throw new TonkError("invalid", "bad transaction hash", 400);
    return tonkJson(await launchStatus(network, hash as `0x${string}`, senderOf(params)));
  } catch (error) {
    return tonkErrorResponse(error);
  }
}
