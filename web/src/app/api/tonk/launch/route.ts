import { overLimit } from "@/shared/lib/rate-limit";
import { buildLaunch, parseLaunchRequest } from "@/shared/tonk/server/launch";
import { requireNetwork, tonkErrorResponse, tonkJson } from "@/shared/tonk/server/respond";

/**
 * Builds a launch for the creator's wallet: POST /api/tonk/launch with the
 * Creator Studio's settings. The call is simulated from the creator's
 * address first; the answer is an unsigned transaction. Nothing is sent.
 */
export async function POST(request: Request) {
  const limited = overLimit(request, "tonkLaunch");
  if (limited) return limited;
  try {
    const network = requireNetwork();
    const body: unknown = await request.json().catch(() => null);
    return tonkJson(await buildLaunch(network, parseLaunchRequest(body)));
  } catch (error) {
    return tonkErrorResponse(error);
  }
}
