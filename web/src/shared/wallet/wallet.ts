"use client";

import { useSyncExternalStore } from "react";
import type { ChainId } from "@/shared/types/chain";
import { loadDriver } from "./load-driver";
import { createWalletStore } from "./store";
import { EMPTY_SNAPSHOT, type WalletState } from "./types";

/** The app's one wallet. Importing this is cheap: the wallet library loads on first use. */
export const wallet = createWalletStore(loadDriver);

const SERVER_STATE: WalletState = { phase: "idle", snapshot: EMPTY_SNAPSHOT };

export interface WalletView {
  phase: WalletState["phase"];
  /** The wallet code is loading, or a connection is being made or restored. */
  pending: boolean;
  /** The active chain and its address, or null while disconnected. */
  chain: ChainId | null;
  address: string | null;
  accounts: Partial<Record<ChainId, string>>;
}

/** The wallet in Client Components. The server render (and hydration) always sees it disconnected. */
export function useWallet(): WalletView {
  const state = useSyncExternalStore(wallet.subscribe, wallet.getState, () => SERVER_STATE);
  const { active, accounts, pending } = state.snapshot;
  const address = active ? (accounts[active] ?? null) : null;
  return {
    phase: state.phase,
    pending: pending || state.phase === "loading",
    chain: address ? active : null,
    address,
    accounts,
  };
}
