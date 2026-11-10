import type { ChainId } from "./chain";

/** A token the swap can trade. Native coins (SOL, ETH) carry their chain's placeholder address. */
export interface SwapToken {
  chain: ChainId;
  /** Mint (Solana) or contract (Robinhood Chain); the native placeholder for SOL and ETH. */
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Art: a local path or an https URL; null shows the symbol's first letter. */
  icon: string | null;
  /** The chain's own coin: paid from the wallet's native balance. */
  native?: boolean;
}

/** One quote, in raw integer amounts (decimal strings, as they can exceed Number's range). */
export interface SwapQuote {
  chain: ChainId;
  provider: "jupiter" | "0x";
  inToken: string;
  outToken: string;
  inAmount: string;
  outAmount: string;
  /** The least the trade can return at the chosen slippage. */
  minOut: string;
  slippageBps: number;
  /** 0–1, or null when the provider doesn't say. */
  priceImpact: number | null;
  /** tonkfun.fun's fee on this trade (null when none is taken), in the raw units of `token`. */
  fee: { bps: number; amount: string; token: string } | null;
  /** Estimated network cost in the chain's coin (lamports or wei), or null when unknown. */
  networkFee: string | null;
  /** USD values of the two sides, when prices are known. */
  inUsd: number | null;
  outUsd: number | null;
  /** The venues the route runs through ("Raydium", "Uniswap V4"). */
  route: string[];
  /** Whether the server builds real transactions yet (the go-live switch). */
  tradingOpen: boolean;
  /** Unix ms. */
  quotedAt: number;
}

/** A transaction ready for the wallet, with the quote it was built from. */
export interface SwapBuild {
  quote: SwapQuote;
  /** Solana: the unsigned v0 transaction (base64) and the block height it expires at. */
  solana?: { transaction: string; lastValidBlockHeight: number };
  /** Robinhood Chain: an ERC-20 approval to send first when the allowance is short, then the swap. */
  evm?: {
    approval: { token: string; spender: string; amount: string } | null;
    transaction: { to: string; data: string; value: string; gas: string | null };
  };
}

export type SwapTxState = "pending" | "confirmed" | "failed";

/** One finished or attempted swap, as Recent lists it (kept on this device only). */
export interface RecentSwap {
  id: string;
  chain: ChainId;
  from: { symbol: string; amount: string };
  to: { symbol: string; amount: string };
  /** Transaction signature (Solana) or hash (Robinhood Chain). */
  tx: string;
  state: SwapTxState;
  /** Unix ms. */
  at: number;
}
