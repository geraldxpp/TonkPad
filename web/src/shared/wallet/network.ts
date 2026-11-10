import { isRejection, WalletActionError } from "./types";

/** What the guard needs from a wallet on an EVM chain. */
export interface EvmNetworkAccess {
  /** The chain the wallet says it's on now (asked of the wallet itself, never the library's record); null if it won't say. */
  chainId(): Promise<number | null>;
  /** Asks the wallet to move to the chain, adding it where needed. Throws when it doesn't. */
  switchTo(): Promise<void>;
}

/**
 * Makes sure the wallet is on the chain before anything is sent, so a swap
 * built for Robinhood Chain can never go out on another network. Saying no
 * to the switch stays a refusal; a wallet that can't switch, or claims to
 * and doesn't, is a "network" error.
 */
export async function ensureEvmChain(wallet: EvmNetworkAccess, chainId: number): Promise<void> {
  if ((await wallet.chainId()) === chainId) return;
  try {
    await wallet.switchTo();
  } catch (error) {
    if (isRejection(error)) throw error;
    throw new WalletActionError("network");
  }
  if ((await wallet.chainId()) !== chainId) throw new WalletActionError("network");
}
