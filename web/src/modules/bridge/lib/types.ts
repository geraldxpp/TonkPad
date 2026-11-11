/** Who carries a transfer. */
export type RouteProvider = "relay" | "across" | "lifi" | "canonical";

/** What a transfer can be followed by: its source transaction and, for some routes, the route's own id. */
export interface TransferTracking {
  provider: RouteProvider;
  /** Relay's request id. */
  requestId: string | null;
  /** The bridge LI.FI picked. */
  tool: string | null;
}

/** One way across, as the screen shows it. Amounts are base units of the arriving asset. */
export interface BridgeRoute {
  /** Stable across refreshes, so a choice survives a new quote. */
  id: string;
  provider: RouteProvider;
  /** "Relay", "Across", "Layerswap via LI.FI", "Arbitrum canonical bridge". */
  name: string;
  outAmount: string;
  minOut: string;
  etaSeconds: number;
  inUsd: number | null;
  outUsd: number | null;
  /** The route's own cost; null when it can't be worked out. */
  feeUsd: number | null;
  /** The source network's gas. */
  networkUsd: number | null;
  /** Gas delivered with the transfer: base units of the destination's coin. */
  gasTopUp: { raw: string; usd: number | null } | null;
  /** Secured by the chain itself, with no third party in between. */
  trustless: boolean;
}

export interface BridgeQuote {
  routes: BridgeRoute[];
  /** The go-live switch: whether real transfers can be built. */
  tradingOpen: boolean;
  quotedAt: number;
}

/** An ERC-20 approval, always for exactly what's being sent (or zero, to clear an old allowance first). */
export interface BridgeApproval {
  token: string;
  spender: string;
  amount: string;
}

export interface EvmCall {
  chainId: number;
  to: string;
  data: string;
  value: string;
  gas: string | null;
}

/** What the wallet signs, built for one route after the review. */
export interface BridgeBuild {
  route: BridgeRoute;
  approvals: BridgeApproval[];
  evm: EvmCall | null;
  solana: { transaction: string } | null;
  tracking: TransferTracking;
}

/**
 * Where a transfer stands. "source": its first transaction is confirming.
 * "transit": between networks. "delivered": it landed. "refunded": it came
 * back on the source network. "failed": the source transaction reverted, or
 * the route says it needs support.
 */
export type TransferState = "source" | "transit" | "delivered" | "refunded" | "failed";

export interface BridgeStatus {
  state: TransferState;
  destinationTx: string | null;
}

/** A transfer made on this device. Saved as soon as it has a transaction, so a reload picks it up and never sends again. */
export interface RecentTransfer {
  id: string;
  from: { network: string; symbol: string; amount: string };
  to: { network: string; symbol: string; amount: string };
  routeName: string;
  sender: string;
  recipient: string;
  /** Raw amount sent, which the canonical route's arrival is worked out from. */
  raw: string;
  tracking: TransferTracking;
  sourceTx: string;
  destinationTx: string | null;
  etaSeconds: number;
  state: TransferState;
  at: number;
}
