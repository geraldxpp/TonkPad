"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WALLET_CHAIN_IDS } from "@/shared/config/chains";
import type { ChainId } from "@/shared/types/chain";
import { useWallet } from "@/shared/wallet/wallet";
import { isChainPortfolio, portfolioPath } from "../lib/api";
import type { ChainPortfolio, PortfolioAsset } from "../lib/types";

/** Balances change only when the wallet moves funds, and prices barely in a minute. */
export const PORTFOLIO_REFRESH_MS = 60_000;

export interface ChainView {
  chain: ChainId;
  /** The connected wallet, or null. */
  owner: string | null;
  /** The latest good read for that wallet, or null. */
  data: ChainPortfolio | null;
  loading: boolean;
  /** The latest read failed; `data` keeps the last good one. */
  failed: boolean;
}

interface Held {
  key: string;
  data: ChainPortfolio | null;
  failed: boolean;
  settled: boolean;
}

const EMPTY: Held = { key: "", data: null, failed: false, settled: false };

function useChainPortfolio(chain: ChainId, owner: string | null, tick: number): ChainView {
  const [held, setHeld] = useState<Held>(EMPTY);
  const key = owner ? `${chain}:${owner}` : "";

  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(portfolioPath(chain, owner), { signal: controller.signal, headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: unknown = await res.json();
        if (!isChainPortfolio(body, chain, owner)) throw new Error("bad response");
        setHeld({ key: `${chain}:${owner}`, data: body, failed: false, settled: true });
      } catch {
        if (!controller.signal.aborted) setHeld((prev) => ({ key: `${chain}:${owner}`, data: prev.key === `${chain}:${owner}` ? prev.data : null, failed: true, settled: true }));
      }
    };
    void load();
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refreshVisible, PORTFOLIO_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [chain, owner, tick]);

  const current = held.key === key ? held : EMPTY;
  return { chain, owner, data: owner ? current.data : null, loading: owner !== null && !current.settled, failed: owner !== null && current.failed };
}

export interface PortfolioData {
  /** Every chain a wallet can connect on, in the screen's order. */
  chains: ChainView[];
  /** A wallet is connected on at least one chain. */
  connected: boolean;
  /** The wallet library is restoring or making a connection. */
  walletPending: boolean;
  /** Nothing to show yet, and a connected chain hasn't answered. */
  loading: boolean;
  /** Every connected chain has answered, there is nothing to show, and one couldn't be read: the wallet can't be called empty. */
  failed: boolean;
  assets: PortfolioAsset[];
  /** Tokens without a reliable price, across the chains. */
  unpriced: number;
  /** Something is missing from these figures. */
  partial: boolean;
  /** ms; the newest read, or 0. */
  readAt: number;
  refresh: () => void;
  /** Goes up with each refresh, for whatever else should read again with it. */
  refreshes: number;
}

/** What the connected wallets hold, on every chain, kept fresh while the tab is visible. */
export function usePortfolio(): PortfolioData {
  const { accounts, pending } = useWallet();
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);
  // Both hooks always run; a chain the site doesn't offer simply has no owner.
  const rh = useChainPortfolio("rh", WALLET_CHAIN_IDS.includes("rh") ? (accounts.rh ?? null) : null, tick);
  const sol = useChainPortfolio("sol", WALLET_CHAIN_IDS.includes("sol") ? (accounts.sol ?? null) : null, tick);
  const assets = useMemo(() => [...(rh.data?.assets ?? []), ...(sol.data?.assets ?? [])], [rh.data, sol.data]);
  const chains = [rh, sol];
  const active = chains.filter((chain) => chain.owner !== null);
  const answered = active.every((chain) => !chain.loading);
  return {
    chains,
    connected: active.length > 0,
    walletPending: pending,
    loading: active.length > 0 && assets.length === 0 && !answered,
    failed: active.length > 0 && assets.length === 0 && answered && active.some((chain) => chain.data === null),
    assets,
    unpriced: active.reduce((sum, chain) => sum + (chain.data?.unpriced ?? 0), 0),
    partial: active.some((chain) => chain.failed || chain.data?.partial === true),
    readAt: Math.max(0, ...active.map((chain) => chain.data?.readAt ?? 0)),
    refresh,
    refreshes: tick,
  };
}
