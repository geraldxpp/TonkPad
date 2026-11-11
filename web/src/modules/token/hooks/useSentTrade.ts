"use client";

import { useCallback, useEffect, useState } from "react";
import { useUrlParams } from "@/modules/shell/hooks/useUrlParams";
import { isTxHash } from "@/shared/tonk/types";
import { isSettled, type TxView, useTxStatus } from "@/shared/tonk/useTxStatus";

/** A trade the wallet has sent, watched by its hash. */
export interface SentTrade {
  hash: string;
  tx: TxView;
  /** No receipt yet: another trade waits until this one settles. */
  waiting: boolean;
}

/**
 * The trade in flight, kept in the URL (`?tx=`) as on Launch: a reload while
 * it confirms goes on watching the same hash and never sends another. What
 * this page itself sent or dismissed counts at once, before the URL catches
 * up, so the card, its explorer link and the watch always follow one hash.
 * The page is read again once it is confirmed.
 */
export function useSentTrade(onConfirmed: () => void) {
  const { params, setParams } = useUrlParams();
  const raw = params.get("tx") ?? "";
  const fromUrl = isTxHash(raw) ? raw : null;
  // Null until this page sends or dismisses a trade; from then on its own choice leads.
  const [own, setOwn] = useState<{ hash: string | null } | null>(null);
  const hash = own ? own.hash : fromUrl;
  const tx = useTxStatus(hash);
  const confirmed = hash !== null && tx.state === "confirmed";
  useEffect(() => {
    if (confirmed) onConfirmed();
  }, [confirmed, onConfirmed]);
  const send = useCallback(
    (sent: string) => {
      setOwn({ hash: sent });
      setParams({ tx: sent });
    },
    [setParams],
  );
  const dismiss = useCallback(() => {
    setOwn({ hash: null });
    setParams({ tx: null });
  }, [setParams]);
  const sent: SentTrade | null = hash ? { hash, tx, waiting: !isSettled(tx.state) } : null;
  return { sent, send, dismiss };
}
