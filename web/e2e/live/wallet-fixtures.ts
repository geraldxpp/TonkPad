import { STUB_ACCOUNTS } from "../../src/shared/wallet/stub-driver";

/** The fixture RPC that stands in for Helius and Robinhood Chain in the live e2e run (no keys, no network). */
export const FIXTURE_RPC_PORT = 8789;
export const FIXTURE_RPC_URL = `http://127.0.0.1:${FIXTURE_RPC_PORT}`;

/** The e2e builds' stub wallet (NEXT_PUBLIC_WALLET_STUB=1). */
export const STUB_WALLET = STUB_ACCOUNTS;

/** What the fixture RPC holds for the stub wallets: 1.5 SOL and 2.5M LVS; 0.25 ETH and 1M LVR. */
export const FIXTURE_HOLDINGS = {
  sol: { lamports: 1_500_000_000, tokens: "2500000000000", decimals: 6 },
  rh: { wei: BigInt("250000000000000000"), tokens: BigInt(10) ** BigInt(24), decimals: 18 },
} as const;
