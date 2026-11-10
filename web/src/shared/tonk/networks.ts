/**
 * Where tonkfun.fun's own launchpad contracts live. NEXT_PUBLIC_TONK_NETWORK
 * picks the mode (it only selects public addresses, so it may be public):
 * unset keeps Launch "coming soon", "testnet" wires the app to Robinhood
 * Chain Testnet, and "mock" runs the Creator Studio on mock settings for
 * tests and local development.
 */
export type TonkMode = "off" | "testnet" | "mock";

export interface TonkNetwork {
  chainId: number;
  name: string;
  /** What amounts are counted in: "ETH", or "test ETH" where it has no value. */
  unit: string;
  /** The public RPC; the server may use TONK_RPC_URL instead. */
  rpcUrl: string;
  explorerUrl: string;
  /** Where to get coins for gas, on a testnet. */
  faucetUrl: string | null;
  launchpad: `0x${string}`;
  migrator: `0x${string}`;
  externalRouter: `0x${string}`;
  /** The launchpad's deployment block: where an indexer starts. */
  launchpadBlock: number;
}

/**
 * The repaired contracts on Robinhood Chain Testnet, deployed and verified
 * on 10 Nov 2026 (DEPLOYED-ADDRESSES.json and reports/testnet-deployment.json
 * in the contract project). The Uniswap v4 contracts beside them are an
 * isolated test deployment; later phases add their addresses here.
 */
export const TONK_TESTNET: TonkNetwork = {
  chainId: 46630,
  name: "Robinhood Chain Testnet",
  unit: "test ETH",
  rpcUrl: "https://rpc.testnet.chain.robinhood.com/rpc",
  explorerUrl: "https://explorer.testnet.chain.robinhood.com",
  faucetUrl: "https://faucet.testnet.chain.robinhood.com",
  launchpad: "0xB9bb81242ce7B40775CEADF3b591411f0320Ec82",
  migrator: "0x6c0Fb62E5652EB6C2a257EeBBa75Ad2DcE708909",
  externalRouter: "0x73d4aeDd253044bA96D6BabB47016651c57BA2e7",
  launchpadBlock: 151119562,
};

/** The mode a value of NEXT_PUBLIC_TONK_NETWORK asks for; anything unknown is off. */
export function parseTonkMode(value: string | undefined): TonkMode {
  const mode = value?.trim().toLowerCase();
  return mode === "testnet" || mode === "mock" ? mode : "off";
}

/** This build's mode. The variable is inlined at build time, so the browser sees the same answer as the server. */
export function tonkMode(): TonkMode {
  return parseTonkMode(process.env.NEXT_PUBLIC_TONK_NETWORK);
}

/** The network this build's contracts are on, or null when none is connected (off and mock). */
export function tonkNetwork(mode: TonkMode = tonkMode()): TonkNetwork | null {
  return mode === "testnet" ? TONK_TESTNET : null;
}

/** True on the testnet site, where `rh` means the testnet everywhere and Solana isn't offered. */
export function isTestnetSite(): boolean {
  return tonkMode() === "testnet";
}

export const explorerTxUrl = (network: TonkNetwork, hash: string) => `${network.explorerUrl}/tx/${hash}`;
export const explorerAddressUrl = (network: TonkNetwork, address: string) => `${network.explorerUrl}/address/${address}`;
