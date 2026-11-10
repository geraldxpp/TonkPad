import { overLimit } from "@/shared/lib/rate-limit";
import { buildAction, parseActionRequest } from "@/shared/tonk/server/action";
import { requireNetwork, tonkErrorResponse, tonkJson } from "@/shared/tonk/server/respond";

/**
 * Builds a holder's reward claim or withdrawal, or the creator's claim, lock
 * extension or edit, for their wallet: POST /api/tonk/action. Simulated from
 * that wallet first; the answer is an unsigned transaction. Nothing is sent.
 */
export async function POST(request: Request) {
  const limited = overLimit(request, "tonkAction");
  if (limited) return limited;
  try {
    const network = requireNetwork();
    const body: unknown = await request.json().catch(() => null);
    return tonkJson(await buildAction(network, parseActionRequest(body)));
  } catch (error) {
    return tonkErrorResponse(error);
  }
}
