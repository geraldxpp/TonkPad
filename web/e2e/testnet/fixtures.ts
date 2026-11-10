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

/** The e2e build's stub wallet holds 0.5 test ETH on the fixture; any other address holds nothing. */
export const STUB_WALLET = STUB_ACCOUNTS.rh;
export const STUB_BALANCE = "500000000000000000";
