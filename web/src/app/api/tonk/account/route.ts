import { isEvmAddress } from "@/shared/lib/address";
import { overLimit } from "@/shared/lib/rate-limit";
import { readAccount } from "@/shared/tonk/server/account";
import { TonkError } from "@/shared/tonk/server/client";
import { requireNetwork, tonkErrorResponse, tonkJson } from "@/shared/tonk/server/respond";

/** A wallet's standing on one mission: GET /api/tonk/account?token=0x…&owner=0x…. */
export async function GET(request: Request) {
  const limited = overLimit(request, "tonkAccount");
  if (limited) return limited;
  try {
    const network = requireNetwork();
    const query = new URL(request.url).searchParams;
    const [token, owner] = [query.get("token") ?? "", query.get("owner") ?? ""];
    if (!isEvmAddress(token) || !isEvmAddress(owner)) throw new TonkError("invalid", "bad address", 400);
    return tonkJson(await readAccount(network, token, owner));
  } catch (error) {
    return tonkErrorResponse(error);
  }
}
