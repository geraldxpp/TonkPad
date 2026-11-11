import type { TradeSide } from "./mission";
import type { UnsignedTx } from "./types";

/**
 * A graduated token trades on its Uniswap v4 pool through Uniswap's official
 * router (prompts/07-mainnet.md, section 3). These are the shapes the
 * browser and the server exchange for it.
 */

/** What the pool gives for an exact amount in, as V4Quoter answered it at one block. */
export interface PoolQuoteJson {
  /** The pool's id, the hash of its key: how a receipt's Swap is matched to it. */
  pool: string;
  side: TradeSide;
  /** Wei: ETH for a buy, tokens for a sell. */
  amountIn: string;
  /** Wei of what comes back: tokens for a buy, ETH for a sell. */
  out: string;
  /** The pool's swap fee in basis points: the 1% protocol fee plus the token's Crew and Creator rewards. */
  feeBps: number;
  block: number;
}

/** A pool trade as the browser asks the server to build it: POST /api/tonk/pool/trade. */
export interface PoolTradeRequest {
  token: string;
  trader: string;
  side: TradeSide;
  amount: string;
  /** The least the trader accepts, in wei. */
  minOut: string;
  /** The approval or allowance the wallet just confirmed for this sale: the build reads the chain no earlier than its block. */
  approval?: string | null;
}

/**
 * The server's answer. A sell first approves Permit2 for exactly the amount
 * ("approve"), then allows the router that amount for thirty minutes
 * ("allow"); then the swap ("trade"). "moved": the quote fell under the
 * trader's minimum, and nothing was built. Nothing is ever sent.
 */
export type PoolTradeBuild = { step: "approve" | "allow" | "trade"; tx: UnsignedTx; quote: PoolQuoteJson } | { step: "moved"; quote: PoolQuoteJson };
