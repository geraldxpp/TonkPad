import { CHAINS } from "@/shared/config/chains";
import { type TonkMode, tonkMode, type TonkNetwork, tonkNetwork } from "@/shared/tonk/networks";
import { readSettings } from "@/shared/tonk/server/settings";
import type { TonkSettingsJson } from "@/shared/tonk/types";

/** What the Creator Studio needs before the first paint. */
export interface LaunchData {
  /** "testnet" and "mainnet" launch for real on their chain; "mock" is the demo the tests run on. */
  mode: Exclude<TonkMode, "off">;
  chainName: string;
  /** What amounts are counted in: "ETH" or "test ETH". */
  unit: string;
  explorerUrl: string | null;
  faucetUrl: string | null;
  /** The launchpad's settings; null when the chain couldn't be read (the screen keeps trying). */
  settings: TonkSettingsJson | null;
}

/** The contract's own defaults for a mainnet launch: 0.005 ETH fee, 6 ETH and 1.073B tokens of virtual reserves. */
export const MOCK_SETTINGS: TonkSettingsJson = {
  chainId: 0,
  launchFee: "5000000000000000",
  virtualEth: "6000000000000000000",
  virtualTokens: "1073000000000000000000000000",
  paused: false,
  gasPrice: "20000000",
  readAt: 0,
};

/** Mock data: the demo studio on the contract's mainnet defaults. Nothing here reaches a chain. */
export async function getLaunchData(): Promise<LaunchData> {
  return { mode: "mock", chainName: CHAINS.rh.name, unit: "ETH", explorerUrl: null, faucetUrl: null, settings: MOCK_SETTINGS };
}

/** Live data: the connected launchpad's own settings, read on the server. */
export async function getLiveLaunchData(network: TonkNetwork, mode: "testnet" | "mainnet"): Promise<LaunchData> {
  const settings = await readSettings(network).catch(() => null);
  return { mode, chainName: network.name, unit: network.unit, explorerUrl: network.explorerUrl, faucetUrl: network.faucetUrl, settings };
}

/** The loader for this build's mode: live wherever a launchpad network is connected, the demo otherwise. */
export function loadLaunchData(mode: TonkMode = tonkMode()): Promise<LaunchData> {
  const network = tonkNetwork(mode);
  return network && (mode === "testnet" || mode === "mainnet") ? getLiveLaunchData(network, mode) : getLaunchData();
}
