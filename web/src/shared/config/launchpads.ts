import type { Launchpad, LaunchpadId } from "@/shared/types/launchpad";

export const LAUNCHPADS: Record<LaunchpadId, Launchpad> = {
  tonk: { id: "tonk", name: "Tonkpad", logo: "/launchpads/tonk.png", letter: "T", background: "#3D8EF0", foreground: "#04101E" },
  pons: { id: "pons", name: "Pons", logo: "/launchpads/pons.png", letter: "Pn", background: "#2DD4BF", foreground: "#032A25" },
  pump: { id: "pump", name: "Pump.fun", logo: "/launchpads/pump.png", letter: "P", background: "#3BE2A0", foreground: "#05261A" },
  bonk: { id: "bonk", name: "Bonk.fun", logo: "/launchpads/bonk.png", letter: "B", background: "#FF9B2F", foreground: "#2B1500" },
  bags: { id: "bags", name: "Bags", logo: "/launchpads/bags.png", letter: "G", background: "#33C2FF", foreground: "#00243A" },
  moon: { id: "moon", name: "Moonshot", logo: "/launchpads/moon.png", letter: "M", background: "#FFD24A", foreground: "#2B2000" },
  heaven: { id: "heaven", name: "Heaven", logo: "/launchpads/heaven.png", letter: "H", background: "#FF7EC8", foreground: "#2E0A1F" },
};

export function isLaunchpadId(value: string | null | undefined): value is LaunchpadId {
  return value != null && Object.hasOwn(LAUNCHPADS, value);
}
