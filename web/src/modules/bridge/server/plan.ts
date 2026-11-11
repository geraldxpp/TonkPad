import type { BridgeRoute, EvmCall, TransferTracking } from "../lib/types";

/** Relay's Solana deposit, as instructions for the server to compile. */
export interface SolanaInstructions {
  instructions: { keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; programId: string; data: string }[];
  addressLookupTableAddresses: string[];
}

/** One route's answer: what the screen shows, and what the wallet would sign. */
export interface ProviderPlan {
  route: BridgeRoute;
  tracking: TransferTracking;
  /** Who needs an allowance, when an ERC-20 is sent and the route says one is needed. */
  spender: string | null;
  evm: EvmCall | null;
  solana: SolanaInstructions | null;
}

export const APPROVE_SELECTOR = "0x095ea7b3";

/** How long a network takes to confirm the deposit before a route can start, added to what the route quotes. */
export const sourceSeconds = (networkId: string): number => (networkId === "eth" ? 24 : 5);
