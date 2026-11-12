import { defineConfig, devices } from "@playwright/test";
import { E2E_IMAGES, TESTNET_APP_URL, TESTNET_RPC_URL } from "./e2e/testnet/fixtures";

/**
 * The testnet site: a production build with NEXT_PUBLIC_TONK_NETWORK=testnet,
 * reading a local stand-in for Robinhood Chain Testnet's RPC, so nothing here
 * reaches the real chain or spends faucet ETH. Run after the other suites:
 * all three configurations build into .next.
 */
// No real swap keys and trading closed, whatever a local .env.local holds.
const NO_SWAP = { JUPITER_API_KEY: "", ZEROX_API_KEY: "", SWAP_TRADING: "", SOLANA_FEE_WALLET: "", EVM_FEE_WALLET: "", BRIDGE_TRADING: "", BRIDGE_PROVIDERS: "off" };

export default defineConfig({
  testDir: "./e2e/testnet",
  testMatch: "**/*.testnet.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: TESTNET_APP_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: "npx tsx e2e/testnet/fixture-rpc.ts",
      url: `${TESTNET_RPC_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npm run build && npm run start -- -p ${new URL(TESTNET_APP_URL).port} -H 127.0.0.1`,
      url: TESTNET_APP_URL,
      // The stub wallet, and every chain read (settings and balances) from the fixture RPC.
      env: { NEXT_PUBLIC_TONK_NETWORK: "testnet", TONK_RPC_URL: TESTNET_RPC_URL, NEXT_PUBLIC_WALLET_STUB: "1", WORKER_URL: "", WORKER_TOKEN: "", ...NO_SWAP, ...E2E_IMAGES },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
