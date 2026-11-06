export type ChainId = "sol" | "rh";

export interface Chain {
  id: ChainId;
  name: string;
  /** Letter shown on the original stand-in mark (never the real logo). */
  letter: string;
  /** CSS background for the round chain mark. */
  background: string;
  /** Letter colour on the mark. */
  foreground: string;
  /** Preset amount for the one-tap "Quick buy" button. */
  quickBuy: { amount: string; unit: string };
}
