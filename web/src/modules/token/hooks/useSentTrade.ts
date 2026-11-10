"use client";

import { useCallback, useEffect } from "react";
import { useUrlParams } from "@/modules/shell/hooks/useUrlParams";
import { isTxHash } from "@/shared/tonk/types";
import { type TxView, useTxStatus } from "@/shared/tonk/useTxStatus";

/** A trade the wallet has sent, watched by its hash. */
export interface SentTrade {
  hash: string;
  tx: TxView;
  /** No receipt yet: another trade waits until this one settles. */
  waiting: boolean;
}

/**
 * The trade in flight, kept in the URL (`?tx=`) as on Launch: a reload while
 * it confirms goes on watching the same hash and never sends another. The
 * page is read again once it is confirmed.
 */
export function useSentTrade(onConfirmed: () => void) {
  const { params, setParams } = useUrlParams();
  const raw = params.get("tx") ?? "";
  const hash = isTxHash(raw) ? raw : null;
  const tx = useTxStatus(hash);
  const confirmed = hash !== null && tx.state === "confirmed";
  useEffect(() => {
    if (confirmed) onConfirmed();
  }, [confirmed, onConfirmed]);
  const send = useCallback((sent: string) => setParams({ tx: sent }), [setParams]);
  const dismiss = useCallback(() => setParams({ tx: null }), [setParams]);
  const waiting = tx.state === "checking" || tx.state === "pending" || tx.state === "unknown";
  const sent: SentTrade | null = hash ? { hash, tx, waiting } : null;
  return { sent, send, dismiss };
}
