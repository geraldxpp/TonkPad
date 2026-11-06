export type LaunchpadId = "tonk" | "pons" | "pump" | "bonk" | "bags" | "moon" | "heaven";

export interface Launchpad {
  id: LaunchpadId;
  name: string;
  /** The launchpad's own logo under /public, or null to show `letter` on `background` instead. */
  logo: string | null;
  /** Letter(s) on the rounded-square mark used while there is no logo file. */
  letter: string;
  background: string;
  foreground: string;
}
