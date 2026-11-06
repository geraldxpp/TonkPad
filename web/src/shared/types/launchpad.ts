export type LaunchpadId = "tonk" | "pons" | "pump" | "bonk" | "bags" | "moon" | "heaven";

export interface Launchpad {
  id: LaunchpadId;
  name: string;
  /** Letter(s) on the rounded-square stand-in mark (never the real logo). */
  letter: string;
  background: string;
  foreground: string;
}
