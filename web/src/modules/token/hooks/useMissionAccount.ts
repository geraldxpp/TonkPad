"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAccount } from "@/shared/tonk/api";
import type { MissionAccountJson } from "@/shared/tonk/mission";
import { useWallet } from "@/shared/wallet/wallet";

const REFRESH_MS = 10_000;

export interface AccountView {
  /** The connected wallet's address on Robinhood Chain, or null. */
  owner: string | null;
  /** Its standing on this token; null until read, or when it can't be. */
  account: MissionAccountJson | null;
  loading: boolean;
  failed: boolean;
  /** Reads it again at once: after a confirmed trade or claim. */
  refresh: () => void;
}

/** The connected wallet's coin, tokens, allowance, unpaid rewards and unpaid ETH on one mission, kept fresh. */
export function useMissionAccount(token: string): AccountView {
  const owner = useWallet().accounts.rh ?? null;
  const [state, setState] = useState<{ key: string; account: MissionAccountJson | null; failed: boolean }>({ key: "", account: null, failed: false });
  const [tick, setTick] = useState(0);
  const key = owner ? `${token}:${owner}` : "";

  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    const load = () =>
      fetchAccount(token, owner, controller.signal).then(
        (account) => setState({ key: `${token}:${owner}`, account, failed: false }),
        () => {
          if (!controller.signal.aborted) setState((prev) => ({ key: `${token}:${owner}`, account: prev.key === `${token}:${owner}` ? prev.account : null, failed: true }));
        },
      );
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [token, owner, tick]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  const current = state.key === key ? state : { account: null, failed: false };
  return { owner, account: owner ? current.account : null, loading: owner !== null && current.account === null && !current.failed, failed: current.failed, refresh };
}
