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

/** LIVE_SOLANA's DexScreener pair: the fixture worker answers GeckoTerminal-shaped candles for it locally. */
export const LIVE_SOLANA_POOL = "LiveSo1anaPoo1111111111111111111111111111111";

export const LIVE_ROBINHOOD = {
  address: "0x1234567890abcdef1234567890abcdef12345678",
  name: "Live Robinhood",
  symbol: "LVR",
  chain: "rh",
  launchpad: "pons",
  marketCap: 41_200,
} as const;

export const FRESH_ADDRESS = "11111111111111111111111111111111";
/** Wallets trading the Robinhood fixture's curve. */
export const FIXTURE_TRADERS = ["0xaaaa00000000000000000000000000000000aaaa", "0xbbbb00000000000000000000000000000000bbbb"] as const;
export const UNKNOWN_ADDRESS = "0x9999999999999999999999999999999999999999";
