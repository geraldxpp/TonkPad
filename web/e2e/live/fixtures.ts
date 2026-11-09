/** Local-only integration data: no external feed or credentials are used. */
export const FIXTURE_WORKER_TOKEN = "tonkpad-live-e2e-only";
export const FIXTURE_WORKER_URL = "http://127.0.0.1:8788";

export const LIVE_SOLANA = {
  address: "So11111111111111111111111111111111111111112",
  name: "Live Solana",
  symbol: "LVS",
  chain: "sol",
  launchpad: "pump",
  marketCap: 62_100,
} as const;

export const LIVE_ROBINHOOD = {
  address: "0x1234567890abcdef1234567890abcdef12345678",
  name: "Live Robinhood",
  symbol: "LVR",
  chain: "rh",
  launchpad: "pons",
  marketCap: 41_200,
} as const;

export const FRESH_ADDRESS = "11111111111111111111111111111111";
export const UNKNOWN_ADDRESS = "0x9999999999999999999999999999999999999999";
