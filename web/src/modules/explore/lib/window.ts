import type { Token, TokenWindow } from "@/shared/types/token";
import type { Timeframe } from "./view";

/** Change and volume over the toolbar's timeframe. Mock tokens only carry 24h figures. */
export function tokenWindow(token: Token, tf: Timeframe): TokenWindow {
  return token.windows?.[tf] ?? { change: token.change24h, volume: token.volume24h };
}
