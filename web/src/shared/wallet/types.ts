import type { ChainId } from "@/shared/types/chain";

/** What the wallet library reports, in the app's own terms. */
export interface WalletSnapshot {
  /** The chain the wallet acts on: the one shown in the top bar. Null while nothing is connected. */
  active: ChainId | null;
  /** The connected address on each chain. */
  accounts: Partial<Record<ChainId, string>>;
  /** A connection is being made or restored (the wallet picker is open, or a saved session is coming back). */
  pending: boolean;
}

export const EMPTY_SNAPSHOT: WalletSnapshot = { active: null, accounts: {}, pending: false };

/** A Robinhood Chain transaction for the wallet to send; amounts are wei, as decimal strings. */
export interface EvmTransactionRequest {
  to: string;
  data: string;
  value: string;
  gas: string | null;
}

/** A transaction on one of the bridge's EVM networks. */
export interface BridgeTransactionRequest extends EvmTransactionRequest {
  chainId: number;
}

const ACTION_ERRORS = {
  rejected: "Rejected in the wallet",
  failed: "The wallet could not do this",
  network: "The wallet is not on the swap's network and could not switch to it",
} as const;

/** Why a wallet action didn't happen: the person said no, the wallet couldn't do it, or it couldn't reach the swap's network. */
export class WalletActionError extends Error {
  constructor(readonly code: keyof typeof ACTION_ERRORS) {
    super(ACTION_ERRORS[code]);
    this.name = "WalletActionError";
  }
}

/** True for a wallet's "user rejected" answer: EIP-1193 code 4001, or a refusal in the message (Solana wallets vary). */
export function isRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === 4001 || code === "ACTION_REJECTED" || (typeof message === "string" && /reject|denied|declined|cancel/i.test(message));
}

/**
 * The seam between the app and a wallet library. The real one wraps Reown
 * AppKit; the e2e builds use a stub. Connecting only shares an address;
 * signing and sending happen only when a swap asks and the person approves
 * in their wallet.
 */
export interface WalletDriver {
  snapshot(): WalletSnapshot;
  /** Calls back after every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Opens the wallet picker for one chain. Resolves once it shows (or once the stub has connected). */
  connect(chain: ChainId): Promise<void>;
  /** Makes a connected chain the active one, or starts connecting it. */
  switchChain(chain: ChainId): Promise<void>;
  /** Ends every connection. */
  disconnect(): Promise<void>;
  /** Keeps the wallet picker in the page's theme. */
  setTheme(theme: "dark" | "light"): void;
  /** Has the connected Solana wallet sign a transaction (base64); resolves with the signed one, base64. Never sends. */
  signSolanaTransaction(transaction: string): Promise<string>;
  /** Has the connected Robinhood Chain wallet send a transaction (switching it to the chain first); resolves with the hash. */
  sendEvmTransaction(request: EvmTransactionRequest): Promise<string>;
  /** Has the connected EVM wallet send a bridge's transaction on its source network (moving it there first); resolves with the hash. */
  sendBridgeTransaction(request: BridgeTransactionRequest): Promise<string>;
  /** Has the connected EVM wallet sign a text message (EIP-191 personal_sign: free, no transaction); resolves with the signature. */
  signEvmMessage(message: string): Promise<string>;
}

/**
 * The app-wide wallet state. "idle" until the wallet code is first needed
 * (it loads on Connect, or on load for someone who was connected before);
 * "unavailable" when it can't load, e.g. without a Reown project id.
 */
export interface WalletState {
  phase: "idle" | "loading" | "ready" | "unavailable";
  snapshot: WalletSnapshot;
}
