"use client";

import { Zap } from "lucide-react";
import { type Ref, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { TradeQuote, TradeSide } from "../../lib/trade";
import type { TradeToken } from "./types";

interface TradeActionProps {
  ref?: Ref<HTMLButtonElement>;
  token: TradeToken;
  side: TradeSide;
  amount: string;
  quote: TradeQuote;
  coin: string;
  chainName: string;
}

/** The trade button, or the reason there's no trade yet. Phase 1 has no wallet, so a trade only says so. */
export function TradeAction({ ref, token, side, amount, quote, coin, chainName }: TradeActionProps) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const [tried, setTried] = useState(false);
  const buy = side === "buy";
  if (quote.blocked) {
    const reason = quote.blocked === "enter" ? tr.enter : quote.blocked === "short" ? fmt(tr.short, { unit: coin, chain: chainName }) : fmt(tr.shortToken, { ticker: token.ticker });
    return (
      <button ref={ref} type="button" aria-disabled="true" className="h-[52px] cursor-not-allowed rounded-[14px] border border-line-strong bg-input px-3 text-[15px] font-semibold text-text-2">
        {reason}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        ref={ref}
        type="button"
        onClick={() => setTried(true)}
        className={cn(
          "inline-flex h-[52px] items-center justify-center gap-1.5 rounded-[14px] px-3 text-[16px] font-semibold",
          buy ? "bg-pos text-on-pos" : "bg-neg text-[var(--badge-on-alert)]",
        )}
      >
        <Zap size={16} fill="currentColor" stroke="none" aria-hidden="true" />
        {buy ? fmt(tr.ctaBuy, { ticker: token.ticker, amount, unit: coin }) : fmt(tr.ctaSell, { amount: `${amount}M`, ticker: token.ticker })}
      </button>
      <span role="status" className="text-center text-[12px] text-warn empty:hidden">
        {tried ? tr.soon : ""}
      </span>
    </div>
  );
}
