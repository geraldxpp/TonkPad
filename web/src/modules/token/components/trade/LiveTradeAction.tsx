"use client";

import { ArrowRight, LoaderCircle, Wallet } from "lucide-react";
import { useId, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { buttonClasses } from "@/shared/ui/Button";
import { useWallet, wallet } from "@/shared/wallet/wallet";
import { DISABLED_TRADE, type TradeActionProps, tradeLabel } from "./TradeAction";

interface LiveTradeActionProps extends Omit<TradeActionProps, "ref"> {
  /** The wallet connected on the token's chain, or null. */
  owner: string | null;
  /** The swap engine's answer: whether trading is open, a firm-enough quote, or why not. */
  live: { ready: boolean; tradingOpen: boolean | null; error: string | null; loading: boolean };
  onReview: () => void;
}

/**
 * Below a live token's trade form: Connect wallet (a wallet for the token's
 * chain, when one is connected on the other chain) or, once connected there,
 * the trade button. It opens the review once trading is open and a quote is
 * in; until then it stays disabled with the reason underneath.
 */
export function LiveTradeAction({ owner, live, onReview, ...props }: LiveTradeActionProps) {
  const { t } = useI18n();
  const view = useWallet();
  const noteId = useId();
  const [failed, setFailed] = useState(false);
  const { token, chainName } = props;

  if (owner) {
    const label = tradeLabel(t.token.trade, props);
    if (live.tradingOpen && live.ready && !props.quote.blocked) {
      return (
        <button
          type="button"
          onClick={onReview}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 items-center justify-between gap-2 rounded-lg bg-cta px-4 py-2 text-left text-[13px] font-semibold text-on-cta hover:brightness-110"
        >
          {label}
          <ArrowRight size={16} strokeWidth={2} className="flex-none" aria-hidden="true" />
        </button>
      );
    }
    const note =
      live.tradingOpen === false
        ? t.token.live.tradingSoon
        : props.quote.blocked
          ? null
          : live.error === "no-route"
            ? t.swap.noRoute
            : live.error
              ? t.swap.unavailable
              : t.swap.quoting;
    return (
      <div className="flex flex-col gap-2">
        <button type="button" aria-disabled="true" aria-describedby={note ? noteId : undefined} className={DISABLED_TRADE}>
          {label}
        </button>
        {note ? (
          <span id={noteId} className={live.tradingOpen === false ? "text-center text-[11px] text-warn" : "text-center text-[11px] text-text-3"}>
            {note}
          </span>
        ) : null}
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
