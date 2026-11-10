"use client";

import { LoaderCircle, Wallet } from "lucide-react";
import { useId, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { buttonClasses } from "@/shared/ui/Button";
import { useWallet, wallet } from "@/shared/wallet/wallet";
import { DISABLED_TRADE, type TradeActionProps, tradeLabel } from "./TradeAction";

interface LiveTradeActionProps extends Omit<TradeActionProps, "ref"> {
  /** The wallet connected on the token's chain, or null. */
  owner: string | null;
}

/**
 * Below a live token's trade form: Connect wallet (a wallet for the token's
 * chain, when one is connected on the other chain) or, once connected there,
 * the trade button, disabled with a note until trading opens.
 */
export function LiveTradeAction({ owner, ...props }: LiveTradeActionProps) {
  const { t } = useI18n();
  const view = useWallet();
  const noteId = useId();
  const [failed, setFailed] = useState(false);
  const { token, chainName } = props;

  if (owner) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" aria-disabled="true" aria-describedby={noteId} className={DISABLED_TRADE}>
          {tradeLabel(t.token.trade, props)}
        </button>
        <span id={noteId} className="text-center text-[11px] text-warn">
          {t.token.live.tradingSoon}
        </span>
      </div>
    );
  }

  // A wallet on the other chain stays connected; this adds one for the token's chain.
  const elsewhere = view.chain !== null && view.chain !== token.chain;
  const start = async () => {
    if (view.pending) return;
    setFailed(false);
    if (!(await wallet.connect(token.chain))) setFailed(true);
  };
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void start()}
        aria-busy={view.pending || undefined}
        aria-describedby={noteId}
        className={buttonClasses("cta", "lg", "h-11 w-full rounded-lg text-[13px]")}
      >
        {view.pending ? (
          <LoaderCircle size={18} strokeWidth={2} className="tk-spin" aria-hidden="true" />
        ) : (
          <Wallet size={18} strokeWidth={2} aria-hidden="true" />
        )}
        {elsewhere ? fmt(t.wallet.connectOn, { chain: chainName }) : t.header.connectWallet}
      </button>
      <span id={noteId} className="text-center text-[11px] text-text-3">
        {t.wallet.note}
      </span>
      {failed ? (
        <span role="alert" className="text-center text-[12px] text-neg">
          {t.wallet.unavailable}
        </span>
      ) : null}
    </div>
  );
}
