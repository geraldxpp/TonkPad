import type { ChainId } from "@/shared/types/chain";
import type { WalletSnapshot } from "./types";

/** AppKit's namespace for each of the app's chains. */
export const NAMESPACES = { sol: "solana", rh: "eip155" } as const satisfies Record<ChainId, string>;

/** What the driver reads from AppKit for one namespace (a subset of its account state). */
export interface NamespaceAccount {
  isConnected: boolean;
  address?: string;
  status?: string;
}

/** The AppKit state a snapshot is made from. */
export interface AppKitView {
  /** AppKit has set up its adapters and tried to bring back a saved session. */
  initialized: boolean;
  /** Its wallet picker is open. */
  open: boolean;
  activeNamespace: string | undefined;
  accounts: Record<(typeof NAMESPACES)[ChainId], NamespaceAccount | undefined>;
  /** The connected EVM wallet's name, from AppKit's wallet info. */
  evmWallet?: string;
}

const CHAINS: readonly ChainId[] = ["sol", "rh"];

/**
 * AppKit's state in the app's terms. The active chain is AppKit's active
 * namespace when that one is connected, else whichever chain is. The wallet
 * is pending until AppKit is set up, while its picker is open and while a
 * connection is being made or restored.
 */
export function toSnapshot(view: AppKitView): WalletSnapshot {
  const accounts: Partial<Record<ChainId, string>> = {};
  let busy = false;
  for (const chain of CHAINS) {
    const account = view.accounts[NAMESPACES[chain]];
    if (account?.isConnected && account.address) accounts[chain] = account.address;
    if (account?.status === "connecting" || account?.status === "reconnecting") busy = true;
  }
  const named = CHAINS.find((chain) => NAMESPACES[chain] === view.activeNamespace);
  const active = named && accounts[named] ? named : (CHAINS.find((chain) => accounts[chain]) ?? null);
  return { active, accounts, pending: !view.initialized || view.open || busy, evmWallet: accounts.rh ? view.evmWallet?.trim() || null : null };
}

/** Snapshots that would render the same. */
export function sameSnapshot(left: WalletSnapshot, right: WalletSnapshot): boolean {
  return (
    left.active === right.active &&
    left.pending === right.pending &&
    left.evmWallet === right.evmWallet &&
    CHAINS.every((chain) => left.accounts[chain] === right.accounts[chain])
  );
}
