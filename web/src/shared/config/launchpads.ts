import type { Launchpad, LaunchpadId } from "@/shared/types/launchpad";

export const LAUNCHPADS: Record<LaunchpadId, Launchpad> = {
  tonk: { id: "tonk", name: "Tonkpad", letter: "T", background: "#8C7BFF", foreground: "#0B0A1A" },
  pons: { id: "pons", name: "Pons", letter: "Pn", background: "#2DD4BF", foreground: "#032A25" },
  pump: { id: "pump", name: "Pump.fun", letter: "P", background: "#3BE2A0", foreground: "#05261A" },
  bonk: { id: "bonk", name: "Bonk.fun", letter: "B", background: "#FF9B2F", foreground: "#2B1500" },
  bags: { id: "bags", name: "Bags", letter: "G", background: "#33C2FF", foreground: "#00243A" },
  moon: { id: "moon", name: "Moonshot", letter: "M", background: "#FFD24A", foreground: "#2B2000" },
  heaven: { id: "heaven", name: "Heaven", letter: "H", background: "#FF7EC8", foreground: "#2E0A1F" },
};

export function isLaunchpadId(value: string | null | undefined): value is LaunchpadId {
  return value != null && Object.hasOwn(LAUNCHPADS, value);
}
