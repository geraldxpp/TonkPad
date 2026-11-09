/**
 * The mock tokens every screen shows on mock data (Explore's list, the token
 * screen), ported from the `DATA` table in design-reference/explore.dc.html.
 * Raw numbers are formatted by shared/lib/format.ts.
 */
import type { SparkSeed, Token, TokenFlags } from "../types/token";

/** The reference's five seeded sparklines (`SP`). */
export const SPARK = {
  upA: { seed: 11, drift: 0.65, vol: 0.22 },
  upB: { seed: 29, drift: 0.5, vol: 0.34 },
  downA: { seed: 7, drift: -0.6, vol: 0.24 },
  downB: { seed: 53, drift: -0.45, vol: 0.36 },
  vol: { seed: 97, drift: 0.35, vol: 0.55 },
} as const satisfies Record<string, SparkSeed>;

const NONE: TokenFlags = { hot: false, og: false, isNew: false, locked: false, crew: null, agent: false };
const flags = (set: Partial<TokenFlags>): TokenFlags => ({ ...NONE, ...set });
const DAY = 24 * 60;
const art = (ticker: string) => `/tokens/${ticker.toLowerCase()}.svg`;

/** Mock tokens use their ticker as the address, so links stay /token/GHOST. */
const ROWS: Array<Omit<Token, "address">> = [
  { ticker: "GHOST", name: "Ghosty", chain: "rh", launchpad: "tonk", curve: 0.84, score: 94, level: "Safe", spark: SPARK.upA, change24h: 412.6, volume24h: 186_000, holders: 1_204, smartWallets: 5, marketCap: 58_200, flags: flags({ hot: true, locked: true, crew: "2%", agent: true }), creator: "0x7a3c…9f2e", ageMinutes: 18 * DAY, art: art("GHOST") },
  { ticker: "SCAT", name: "Sol Cat", chain: "sol", launchpad: "bonk", curve: 1, score: 88, level: "Safe", spark: SPARK.vol, change24h: 96.4, volume24h: 842_000, holders: 5_104, smartWallets: 3, marketCap: 1_180_000, flags: flags({ og: true, crew: "1%" }), creator: "3mPq…Lw2c", ageMinutes: 5 * DAY, art: art("SCAT") },
  { ticker: "ORB", name: "Orbit", chain: "rh", launchpad: "tonk", curve: 0.91, score: 90, level: "Safe", spark: SPARK.upA, change24h: 221.0, volume24h: 148_000, holders: 988, smartWallets: 4, marketCap: 64_100, flags: flags({ hot: true, locked: true, agent: true }), creator: "0x2b81…c4d9", ageMinutes: 26, art: art("ORB") },
  { ticker: "MOON", name: "Moonboi", chain: "rh", launchpad: "pons", curve: 1, score: 81, level: "Safe", spark: SPARK.upB, change24h: 38.2, volume24h: 410_000, holders: 1_966, smartWallets: 2, marketCap: 864_000, flags: flags({ crew: "0.5%" }), creator: "0x9d0e…7a1b", ageMinutes: 2 * DAY, art: art("MOON") },
  { ticker: "SHRM", name: "Shroomy", chain: "sol", launchpad: "bags", curve: 0.58, score: 61, level: "Caution", spark: SPARK.downA, change24h: -12.4, volume24h: 61_000, holders: 412, smartWallets: 0, marketCap: 37_400, flags: NONE, creator: "Fq3z…T1aa", ageMinutes: 60, art: art("SHRM") },
  { ticker: "BOLT", name: "Sparky", chain: "rh", launchpad: "tonk", curve: 1, score: 58, level: "Caution", spark: SPARK.upB, change24h: 64.9, volume24h: 190_000, holders: 902, smartWallets: 1, marketCap: 276_000, flags: flags({ locked: true, crew: "1%" }), creator: "0x41f7…3e5d", ageMinutes: 3 * DAY, art: art("BOLT") },
  { ticker: "LUMEN", name: "Lumen", chain: "sol", launchpad: "pump", curve: 0.33, score: 77, level: "Safe", spark: SPARK.downB, change24h: -8.1, volume24h: 18_000, holders: 211, smartWallets: 0, marketCap: 21_300, flags: NONE, creator: "Ar5t…eE2p", ageMinutes: 6 * 60, art: art("LUMEN") },
  { ticker: "KITE", name: "Kite", chain: "sol", launchpad: "heaven", curve: 0.29, score: 23, level: "Risky", spark: SPARK.upB, change24h: 17.3, volume24h: 12_000, holders: 158, smartWallets: 0, marketCap: 19_000, flags: NONE, creator: "Zp0o…Mn4b", ageMinutes: 52, art: art("KITE") },
  { ticker: "MOCHI", name: "Mochi", chain: "rh", launchpad: "pons", curve: 0.18, score: 54, level: "Caution", spark: SPARK.vol, change24h: 148.0, volume24h: 9_400, holders: 97, smartWallets: 2, marketCap: 11_600, flags: flags({ isNew: true, agent: true }), creator: "0xe85a…1b0c", ageMinutes: 9, art: art("MOCHI") },
  { ticker: "TIDE", name: "Tide", chain: "sol", launchpad: "tonk", curve: 0.07, score: 72, level: "Safe", spark: SPARK.upA, change24h: 31.5, volume24h: 2_100, holders: 41, smartWallets: 0, marketCap: 7_300, flags: flags({ isNew: true, locked: true }), creator: "Lk2j…Vv7x", ageMinutes: 4, art: art("TIDE") },
];

export const TOKENS: Token[] = ROWS.map((row) => ({ ...row, address: row.ticker }));
