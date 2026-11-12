import { launchInvites } from "@/shared/tonk/invites";
import { type TonkMode, tonkMode, tonkNetwork } from "@/shared/tonk/networks";
import type { TonkSettingsJson } from "@/shared/tonk/types";
import { type DocsContract, mainnetContracts } from "../lib/contracts";

/**
 * Where the page's figures come from:
 * - "live": the browser reads the connected launchpad (testnet, or mainnet once deployed);
 * - "demo": fixed figures, never read from a chain (the demo the tests run on);
 * - "none": no launchpad is connected on this site, so the figures are unavailable.
 */
export type DocsSource = "live" | "demo" | "none";

/** Everything the Docs page needs besides its text, all known when the site is built. */
export interface DocsData {
  source: DocsSource;
  mode: TonkMode;
  /** The connected network's name, where the figures are read live. */
  chainName: string | null;
  /** What amounts are counted in: "ETH", or "test ETH" on the testnet site. */
  unit: string;
  /** The demo's fixed settings; null wherever the browser reads them live. */
  settings: TonkSettingsJson | null;
  /** Launch is invite-only on this site. */
  inviteOnly: boolean;
  contracts: DocsContract[];
}

/**
 * The demo's figures: the mainnet deployment's own settings (0.005 ETH to
 * launch, and 1 ETH and 1.073B tokens of virtual reserves). Nothing here is
 * read from a chain, and the page says so.
 */
export const DEMO_SETTINGS: TonkSettingsJson = {
  chainId: 0,
  launchFee: "5000000000000000",
  virtualEth: "1000000000000000000",
  virtualTokens: "1073000000000000000000000000",
  paused: false,
  gasPrice: null,
  readAt: 0,
};

/**
 * The Docs page's data for this build's mode. The page itself stays static:
 * the launchpad's live settings are read in the browser, from the same
 * /api/tonk/settings the Creator Studio refreshes from.
 */
export async function getDocsData(mode: TonkMode = tonkMode()): Promise<DocsData> {
  const network = tonkNetwork(mode);
  const base = { mode, inviteOnly: launchInvites() !== null, contracts: mainnetContracts() };
  if (network) return { ...base, source: "live", chainName: network.name, unit: network.unit, settings: null };
  if (mode === "mock") return { ...base, source: "demo", chainName: null, unit: "ETH", settings: DEMO_SETTINGS };
  return { ...base, source: "none", chainName: null, unit: "ETH", settings: null };
}
