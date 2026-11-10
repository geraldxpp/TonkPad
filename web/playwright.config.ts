import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * E2E runs against a production build (`next build` + `next start`) so the
 * dev-only overlay never shows up in screenshots. The build swaps in the stub
 * wallet (NEXT_PUBLIC_WALLET_STUB=1).
 */
// No real swap keys and trading closed, whatever a local .env.local holds: the browser stubs /api/swap where a test needs it.
const NO_SWAP = { JUPITER_API_KEY: "", ZEROX_API_KEY: "", SWAP_TRADING: "", SOLANA_FEE_WALLET: "", EVM_FEE_WALLET: "" };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT} -H 127.0.0.1`,
    url: baseURL,
    // The stub wallet stands in for Reown: no real wallets or wallet network in tests.
    env: { NEXT_PUBLIC_WALLET_STUB: "1", ...NO_SWAP },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
