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
 * up, so the card, its explorer link and the watch always follow one hash;
 * any later change of the URL leads again. The page is read again once it
 * is confirmed.
 */
export function useSentTrade(onConfirmed: () => void) {
  const { params, setParams } = useUrlParams();
  const raw = params.get("tx") ?? "";
  const fromUrl = isTxHash(raw) ? raw : null;
  // What this page sent or dismissed, and the URL as it stood then. It leads only while the URL
  // hasn't moved since: once the URL catches up, or moves anywhere else (a link, back or forward), the URL leads.
  const [own, setOwn] = useState<{ hash: string | null; urlThen: string | null } | null>(null);
  // Once the URL has moved, the override is done for good: coming back to the old URL later follows the URL too.
  if (own && own.urlThen !== fromUrl) setOwn(null);
  const hash = own && own.urlThen === fromUrl ? own.hash : fromUrl;
  const tx = useTxStatus(hash);
  const confirmed = hash !== null && tx.state === "confirmed";
  useEffect(() => {
    if (confirmed) onConfirmed();
  }, [confirmed, onConfirmed]);
  const send = useCallback(
    (sent: string) => {
      setOwn({ hash: sent, urlThen: fromUrl });
      setParams({ tx: sent });
    },
    [setParams, fromUrl],
  );
  const dismiss = useCallback(() => {
    setOwn({ hash: null, urlThen: fromUrl });
    setParams({ tx: null });
  }, [setParams, fromUrl]);
  const sent: SentTrade | null = hash ? { hash, tx, waiting: !isSettled(tx.state) } : null;
  return { sent, send, dismiss };
}
