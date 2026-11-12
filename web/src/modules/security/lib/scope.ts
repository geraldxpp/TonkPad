import { explorerAddressUrl, type MainnetDeployment, mainnetNetwork, type TonkMode, tonkMode } from "@/shared/tonk/networks";

/** A deployed contract's address and its page on the explorer. */
export interface LinkedAddress {
  address: string;
  url: string;
}

/**
 * Where the in-scope contracts live:
 * - "deployed": mainnet mode with the deployment's read-back set, so the launchpad and migrator are known;
 * - "pending": anywhere else mainnet isn't connected yet (production today, the demo, mainnet before its values are set);
 * - "elsewhere": the testnet site, whose deployment values name testnet contracts, so it never shows them as mainnet's.
 */
export type ScopeAddresses = { state: "deployed"; launchpad: LinkedAddress; migrator: LinkedAddress } | { state: "pending" } | { state: "elsewhere" };

/** The addresses from the app's own mainnet values, checked the way the rest of the app checks them. */
export function scopeAddresses(mode: TonkMode = tonkMode(), deployment?: MainnetDeployment): ScopeAddresses {
  if (mode === "testnet") return { state: "elsewhere" };
  const network = mode === "mainnet" ? mainnetNetwork(deployment) : null;
  if (!network) return { state: "pending" };
  const linked = (address: string): LinkedAddress => ({ address, url: explorerAddressUrl(network, address) });
  return { state: "deployed", launchpad: linked(network.launchpad), migrator: linked(network.migrator) };
}
