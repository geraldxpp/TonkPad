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

/**
 * The seam between the app and a wallet library. The real one wraps Reown
 * AppKit; the e2e builds use a stub. Connecting only shares an address:
 * nothing here signs or sends anything.
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
