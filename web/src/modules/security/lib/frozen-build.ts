/** The three in-scope contracts on the Security page. */
export type ScopeId = "launchpad" | "migrator" | "guard";

export interface FrozenSource {
  id: ScopeId;
  /** The source file, as the contract project names it. */
  file: string;
  /** The contracts that file defines. */
  contracts: readonly string[];
  /** The file's SHA-256, lowercase hex. */
  sha256: string;
}

/**
 * The launchpad's mainnet build, frozen for release after the second re-review:
 * copied from `reports/mainnet-freeze.json` in the contract project's `mainnet`
 * copy. A change to any of these files means a new freeze (and the internal
 * audit's checks again), so these values change only with that file.
 */
export const FROZEN_AT = "2026-11-11";

export const FROZEN_SOURCES: readonly FrozenSource[] = [
  {
    id: "launchpad",
    file: "src/TonkpadRobinhood.sol",
    contracts: ["TonkpadRobinhood", "TonkToken", "TonkTokenFactory"],
    sha256: "648269c32cbf8de79c3391067c37c1575d7ed61283b705d766608ff055c1591d",
  },
  {
    id: "migrator",
    file: "src/TonkpadUniV4Migrator.sol",
    contracts: ["TonkpadUniV4Migrator"],
    sha256: "0b2aacd09d931de57801507654e24538f2fb34c67803e6b19eff0662fc0bb1ac",
  },
  {
    id: "guard",
    file: "src/TonkPoolInitializationGuard.sol",
    contracts: ["TonkPoolInitializationGuard"],
    sha256: "954c1567df49c8fdc18b853944b8bf6f27b279559caa5fcdc4af8d0a43bc0f0f",
  },
];
