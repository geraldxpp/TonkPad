import { overLimit } from "@/shared/lib/rate-limit";
import { readLatestMissions } from "@/shared/tonk/server/mission";
import { requireNetwork, tonkErrorResponse, tonkJson } from "@/shared/tonk/server/respond";

/** The launchpad's latest launches, newest first: GET /api/tonk/missions. */
export async function GET(request: Request) {
  const limited = overLimit(request, "tonkMissions");
  if (limited) return limited;
  try {
    return tonkJson(await readLatestMissions(requireNetwork()), 10);
  } catch (error) {
    return tonkErrorResponse(error);
  }
}
