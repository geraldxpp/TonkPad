import { defineConfig, devices } from "@playwright/test";
import { MAINNET_APP_URL, MAINNET_DEPLOYMENT, MAINNET_RPC_URL } from "./e2e/testnet/fixtures";

/**
 * The site in mainnet mode: a production build with NEXT_PUBLIC_TONK_NETWORK=mainnet and a made-up
 * deployment, reading the local stand-in RPC as Robinhood Chain mainnet (FIXTURE_CHAIN=mainnet). Every
 * chain read, balances included, goes to the stand-in: nothing here reaches a real chain or sends
 * anything. Run after the other suites: every configuration builds into .next.
 */
// No real swap keys and trading closed, whatever a local .env.local holds.
const NO_SWAP = { JUPITER_API_KEY: "", ZEROX_API_KEY: "", SWAP_TRADING: "", SOLANA_FEE_WALLET: "", EVM_FEE_WALLET: "", BRIDGE_TRADING: "", BRIDGE_PROVIDERS: "off" };

export default defineConfig({
  testDir: "./e2e/mainnet",
  testMatch: "**/*.mainnet.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: MAINNET_APP_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: "npx tsx e2e/testnet/fixture-rpc.ts",
      env: { FIXTURE_CHAIN: "mainnet" },
      url: `${MAINNET_RPC_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npm run build && npm run start -- -p ${new URL(MAINNET_APP_URL).port} -H 127.0.0.1`,
      url: MAINNET_APP_URL,
      env: {
        NEXT_PUBLIC_TONK_NETWORK: "mainnet",
        NEXT_PUBLIC_TONK_LAUNCHPAD: MAINNET_DEPLOYMENT.launchpad,
        NEXT_PUBLIC_TONK_MIGRATOR: MAINNET_DEPLOYMENT.migrator,
        NEXT_PUBLIC_TONK_LAUNCHPAD_BLOCK: MAINNET_DEPLOYMENT.block,
        // The guarded launch's invite list, without the stub wallet: Launch is invite-only for it.
        NEXT_PUBLIC_TONK_LAUNCH_INVITES: "0x1111111111111111111111111111111111111111",
        TONK_RPC_URL: MAINNET_RPC_URL,
        ROBINHOOD_RPC_URL: MAINNET_RPC_URL,
        NEXT_PUBLIC_WALLET_STUB: "1",
        WORKER_URL: "",
        WORKER_TOKEN: "",
        HELIUS_API_KEY: "",
        // A made-up security contact for the Security page; its bounty amounts stay unset.
        NEXT_PUBLIC_SECURITY_CONTACT: "security@example.com",
        NEXT_PUBLIC_BOUNTY_CRITICAL: "",
        NEXT_PUBLIC_BOUNTY_HIGH: "",
        NEXT_PUBLIC_BOUNTY_MEDIUM: "",
        NEXT_PUBLIC_BOUNTY_LOW: "",
        ...NO_SWAP,
      },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
