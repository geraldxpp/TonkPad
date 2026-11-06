import { LAUNCHPADS } from "@/shared/config/launchpads";
import type { LiveOverview } from "@/shared/types/live";
import type { Token } from "@/shared/types/token";
import {
  BLIPS,
  CHAIN_COUNTS,
  HEATING,
  HERO_STATS,
  LAUNCHPAD_COUNTS,
  MISSION_PICK,
  MORE_LAUNCHPADS,
  SCOPE_MORE,
  SCOPE_PADS,
  TOKENS,
  TOTAL_TOKENS,
} from "./explore.mock";

/** Everything above the token list, plus the filter counts. Mock and live data share this shape. */
export type ExploreOverview = Omit<LiveOverview, "updatedAt">;

export interface ExploreData extends ExploreOverview {
  /** Every token; the list filters them in the browser. */
  tokens: Token[];
}

function byTicker(ticker: string): Token {
  const token = TOKENS.find((t) => t.ticker === ticker);
  if (!token) throw new Error(`Unknown ticker in Explore mock data: ${ticker}`);
  return token;
}

/**
 * Everything the Explore screen needs, from the typed mock data. With the
 * live-data worker switched on, getLiveExploreData() serves the screen instead.
 */
export async function getExploreData(): Promise<ExploreData> {
  return {
    tokens: TOKENS,
    heating: HEATING.map(({ ticker, color }) => ({ token: byTicker(ticker), color })),
    blips: BLIPS.map((blip) => ({ ...blip, address: blip.ticker, art: byTicker(blip.ticker).art })),
    launchpads: [...LAUNCHPAD_COUNTS],
    moreLaunchpads: MORE_LAUNCHPADS,
    chainCounts: { ...CHAIN_COUNTS },
    totalTokens: TOTAL_TOKENS,
    stats: [...HERO_STATS],
    missionPick: { ...MISSION_PICK, token: byTicker(MISSION_PICK.ticker) },
    scope: { pads: SCOPE_PADS.map((id) => LAUNCHPADS[id].name), more: SCOPE_MORE },
  };
}
