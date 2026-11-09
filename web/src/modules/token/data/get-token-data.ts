import { TOKENS } from "@/shared/data/mock-tokens";
import type { TokenDetail } from "@/shared/types/token-detail";
import { genericDetail } from "./generic.mock";
import { GHOSTY } from "./ghosty.mock";

/**
 * Everything the token screen shows for `id` (a mock token's ticker, which is
 * its address on mock data), or null when there is no such token. Ghosty is
 * the export's own data; the other mock tokens are built from their figures.
 */
export async function getTokenData(id: string): Promise<TokenDetail | null> {
  const key = decodeURIComponent(id).toUpperCase();
  if (key === "GHOST") return GHOSTY;
  const token = TOKENS.find((t) => t.ticker === key);
  return token ? genericDetail(token) : null;
}
