"use client";

import { usePolling } from "@/shared/live/usePolling";
import type { ChainId } from "@/shared/types/chain";
import { balancesPath, isWalletBalances, type WalletBalances } from "./balances";
import { useWallet } from "./wallet";

/** Balances change only when the wallet trades or moves funds, so a slow refresh is enough. */
export const BALANCES_REFRESH_MS = 15_000;

export interface WalletBalancesView {
  /** The wallet connected on `chain`, whether or not it is the active one. */
  owner: string | null;
  /** The latest good balances for that wallet and token, or null. */
  balances: WalletBalances | null;
  /** The first read is outstanding. */
  loading: boolean;
  /** No balances could be read yet. */
  failed: boolean;
}

/**
 * The connected wallet's coin on `chain` and its holding of `token` (none for
 * just the coin), from the
 * app's /api/wallet route, refreshed while the tab is visible. A response for
 * any other wallet or token is ignored.
 */
export function useWalletBalances(chain: ChainId, token: string | null): WalletBalancesView {
  const { accounts } = useWallet();
  const owner = accounts[chain] ?? null;
  const { data, loading, error } = usePolling<unknown>(owner ? balancesPath(chain, owner, token) : null, null, BALANCES_REFRESH_MS);
  const balances = owner && isWalletBalances(data, chain, owner, token) ? data : null;
  const waiting = owner !== null && balances === null;
  return { owner, balances, loading: waiting && (loading || !error), failed: waiting && !loading && error };
}
