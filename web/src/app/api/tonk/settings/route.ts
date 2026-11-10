import { overLimit } from "@/shared/lib/rate-limit";
import { requireNetwork, tonkErrorResponse, tonkJson } from "@/shared/tonk/server/respond";
import { readSettings } from "@/shared/tonk/server/settings";

/** The launchpad's live settings (fee, reserves, paused, gas price): GET /api/tonk/settings. */
export async function GET(request: Request) {
  const limited = overLimit(request, "tonkSettings");
  if (limited) return limited;
  try {
    return tonkJson(await readSettings(requireNetwork()), 5);
  } catch (error) {
    return tonkErrorResponse(error);
  }
}
