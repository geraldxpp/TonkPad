import { LAUNCHPADS } from "@/shared/config/launchpads";
import { fmt } from "@/shared/i18n/config";
import type { LaunchpadId } from "@/shared/types/launchpad";

/** The export's wallet dots. Wallet identity colours, the same in both themes, like token art. */
const DOTS = [
  "linear-gradient(135deg, #46D9F2, #2D48F0)",
  "linear-gradient(135deg, #FF9A4D, #E2445E)",
  "linear-gradient(135deg, #3BDB98, #0B5E50)",
  "linear-gradient(135deg, #B8ACFF, #5B47F0)",
  "linear-gradient(135deg, #FFB547, #E2445E)",
  "linear-gradient(135deg, #FF8FD6, #8B3BFF)",
  "linear-gradient(135deg, #46D9F2, #0B5E50)",
  "linear-gradient(135deg, #F4C553, #FF7A45)",
] as const;

/** A wallet's dot, picked from its address so a wallet looks the same in every table. */
export function walletDot(address: string): string {
  let h = 0;
  for (const ch of address) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DOTS[h % DOTS.length];
}

/** "Tonkpad Native" for Tonkpad's own launches, the launchpad's name for the rest. */
export function padLabel(pad: LaunchpadId, nativeTemplate: string): string {
  const name = LAUNCHPADS[pad].name;
  return pad === "tonk" ? fmt(nativeTemplate, { name }) : name;
}

/** A token's own link (live data comes from its creator), kept only when it is a plain http(s) URL. */
export function safeUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Where a trade routes: the launchpad's curve until graduation, then Jupiter (Solana) or Uniswap (Robinhood Chain). */
export function venueOf(token: { launchpad: LaunchpadId; chain: "sol" | "rh"; onCurve: boolean }, curveTemplate: string): string {
  if (token.onCurve) return fmt(curveTemplate, { pad: LAUNCHPADS[token.launchpad].name });
  return token.chain === "sol" ? "Jupiter" : "Uniswap";
}

/** The top-10 wallets' share, judged with the same bands as the Mission score (under 20% earns points, 30% and up costs them). */
export function top10Band(share: number): { label: "healthy" | "spread" | "concentrated"; tone: string } {
  if (share < 0.2) return { label: "healthy", tone: "text-pos" };
  if (share < 0.3) return { label: "spread", tone: "text-text-3" };
  return { label: "concentrated", tone: share > 0.5 ? "text-neg" : "text-warn" };
}
