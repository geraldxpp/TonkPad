export type ChainId = "sol" | "rh";

export interface Chain {
  id: ChainId;
  name: string;
  /** The chain's own logo under /public, or null to show `letter` on `background` instead. */
  logo: string | null;
  /** Letter shown on the round mark while there is no logo file. */
  letter: string;
  /** CSS background for the round chain mark. */
  background: string;
  /** Letter colour on the mark. */
  foreground: string;
  /** Preset amount for the one-tap "Quick buy" button. */
  quickBuy: { amount: string; unit: string };
}
