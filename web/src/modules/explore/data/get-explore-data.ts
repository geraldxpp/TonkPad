import { LAUNCHPADS } from "@/shared/config/launchpads";
import type { Token } from "@/shared/types/token";
import {
  BLIPS,
  type BlipSeed,
  HEATING,
  HERO_STATS,
  type HeroStat,
  LAUNCHPAD_COUNTS,
  MISSION_PICK,
  MORE_LAUNCHPADS,
  type PadFilterId,
  SCOPE_MORE,
  SCOPE_PADS,
  TOKENS,
  TOTAL_TOKENS,
} from "./explore.mock";

export interface ExploreData {
  tokens: Token[];
  heating: Array<{ token: Token; color: string }>;
  blips: Array<BlipSeed & { art: string }>;
  launchpads: Array<{ id: PadFilterId; count: number }>;
  moreLaunchpads: number;
  totalTokens: number;
  stats: HeroStat[];
  missionPick: { token: Token; price: number; updatedSecondsAgo: number };
  scopeSubtitle: string;
}

function byTicker(ticker: string): Token {
  const token = TOKENS.find((t) => t.ticker === ticker);
  if (!token) throw new Error(`Unknown ticker in Explore mock data: ${ticker}`);
  return token;
}

/** Everything the Explore screen needs. Typed mock data now; the API later. */
export async function getExploreData(): Promise<ExploreData> {
  return {
    tokens: TOKENS,
    heating: HEATING.map(({ ticker, color }) => ({ token: byTicker(ticker), color })),
    blips: BLIPS.map((blip) => ({ ...blip, art: byTicker(blip.ticker).art })),
    launchpads: [...LAUNCHPAD_COUNTS],
    moreLaunchpads: MORE_LAUNCHPADS,
    totalTokens: TOTAL_TOKENS,
    stats: [...HERO_STATS],
    missionPick: { ...MISSION_PICK, token: byTicker(MISSION_PICK.ticker) },
    scopeSubtitle: `Sweeping ${SCOPE_PADS.map((id) => LAUNCHPADS[id].name).join(", ")} +${SCOPE_MORE}`,
  };
}
