import { defineConfig, devices } from "@playwright/test";
import { FIXTURE_WORKER_TOKEN, FIXTURE_WORKER_URL } from "./e2e/live/fixtures";
import { FIXTURE_RPC_URL } from "./e2e/live/wallet-fixtures";

/** Run after the mock suite: both configurations build into .next. */
// No real swap keys and trading closed, whatever a local .env.local holds: the browser stubs /api/swap where a test needs it.
const NO_SWAP = { JUPITER_API_KEY: "", ZEROX_API_KEY: "", SWAP_TRADING: "", SOLANA_FEE_WALLET: "", EVM_FEE_WALLET: "", BRIDGE_TRADING: "", BRIDGE_PROVIDERS: "off" };

export default defineConfig({
  testDir: "./e2e/live",
  testMatch: "**/*.live.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3101", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: "npx tsx e2e/live/fixture-worker.ts",
      url: `${FIXTURE_WORKER_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npx tsx e2e/live/fixture-rpc.ts",
      url: `${FIXTURE_RPC_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run build && npm run start -- -p 3101 -H 127.0.0.1",
      url: "http://127.0.0.1:3101",
      // The stub wallet, and wallet balances read from the fixture RPC instead of Helius or Alchemy.
      env: {
        WORKER_URL: FIXTURE_WORKER_URL,
        WORKER_TOKEN: FIXTURE_WORKER_TOKEN,
        NEXT_PUBLIC_WALLET_STUB: "1",
        // As in production: no launchpad network, so Launch stays "coming soon".
        NEXT_PUBLIC_TONK_NETWORK: "",
        SOLANA_RPC_URL: `${FIXTURE_RPC_URL}/sol`,
        ROBINHOOD_RPC_URL: `${FIXTURE_RPC_URL}/rh`,
        ...NO_SWAP,
      },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
