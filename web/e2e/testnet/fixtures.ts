import { STUB_ACCOUNTS } from "../../src/shared/wallet/stub-driver";

/** The fixture RPC that stands in for Robinhood Chain Testnet in the testnet e2e run: no test reaches the real chain. */
export const TESTNET_RPC_PORT = 8790;
export const TESTNET_RPC_URL = `http://127.0.0.1:${TESTNET_RPC_PORT}`;
export const TESTNET_APP_URL = "http://127.0.0.1:3102";

/** What the fixture's launchpad answers: the testnet deployment's own settings (0.0001 fee, 0.0015 ETH and 1.073B tokens of virtual reserves). */
export const FIXTURE_LAUNCHPAD = {
  chainId: 46630,
  launchFee: "100000000000000",
  virtualEth: "1500000000000000",
  virtualTokens: "1073000000000000000000000000",
  gasPrice: "10000000",
} as const;

/**
 * The same stand-in as Robinhood Chain mainnet, for the mainnet-mode run (FIXTURE_CHAIN=mainnet):
 * its own port, chain 4663, a made-up deployment, and the contract's mainnet settings
 * (0.005 ETH to launch, 1 ETH of virtual reserve). Nothing here is a real address.
 */
export const MAINNET_RPC_PORT = 8791;
export const MAINNET_RPC_URL = `http://127.0.0.1:${MAINNET_RPC_PORT}`;
export const MAINNET_APP_URL = "http://127.0.0.1:3103";
export const MAINNET_DEPLOYMENT = {
  launchpad: "0x7a4c000000000000000000000000000000000001",
  migrator: "0x7a4c000000000000000000000000000000000002",
  /** The migrator's pool guard: the hook every graduated pool's key names. */
  guard: "0x7a4c000000000000000000000000000000002000",
  block: "151000000",
} as const;
/** The live-data worker for the mainnet-mode run: the real tonkfun.fun feed, following a simulated chain (e2e/mainnet/fixture-worker.ts). */
export const MAINNET_WORKER_PORT = 8792;
export const MAINNET_WORKER_URL = `http://127.0.0.1:${MAINNET_WORKER_PORT}`;
export const MAINNET_WORKER_TOKEN = "tonkpad-mainnet-e2e-only";
/** A Pons token the worker lists: a token the launchpad doesn't know, with its own page. */
export const MAINNET_PONS_TOKEN = "0x5555555555555555555555555555555555555555";
export const MAINNET_LAUNCHPAD = {
  chainId: 4663,
  launchFee: "5000000000000000",
  virtualEth: "1000000000000000000",
  virtualTokens: "1073000000000000000000000000",
  gasPrice: "10000000",
} as const;

/** The e2e build's stub wallet holds 0.5 test ETH on the fixture; any other address holds nothing. */
export const STUB_WALLET = STUB_ACCOUNTS.rh;
export const STUB_BALANCE = "500000000000000000";
