"use client";

import { Zap } from "lucide-react";
import { type Ref, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { TradeQuote, TradeSide } from "../../lib/trade";
import type { TradeToken } from "./types";

export interface TradeActionProps {
  ref?: Ref<HTMLButtonElement>;
  token: TradeToken;
  side: TradeSide;
  amount: string;
  quote: TradeQuote;
  coin: string;
  chainName: string;
}

/** The muted look of a trade button that can't be pressed. */
export const DISABLED_TRADE = "h-[52px] cursor-not-allowed rounded-[14px] border border-line-strong bg-input px-3 text-[15px] font-semibold text-text-2";

/** What the trade button says: the trade ("Buy $GHOST · 0.05 ETH") or why there's none ("Enter an amount"). */
export function tradeLabel(tr: Dictionary["token"]["trade"], { token, side, amount, quote, coin, chainName }: Omit<TradeActionProps, "ref">): string {
  if (quote.blocked === "enter") return tr.enter;
  if (quote.blocked === "short") return fmt(tr.short, { unit: coin, chain: chainName });
  if (quote.blocked === "shortToken") return fmt(tr.shortToken, { ticker: token.ticker });
  return side === "buy" ? fmt(tr.ctaBuy, { ticker: token.ticker, amount, unit: coin }) : fmt(tr.ctaSell, { amount: `${amount}M`, ticker: token.ticker });
}

/** The trade button, or the reason there's no trade yet. Phase 1 has no wallet, so a trade only says so. */
export function TradeAction({ ref, ...props }: TradeActionProps) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const [tried, setTried] = useState(false);
  const buy = props.side === "buy";
  const label = tradeLabel(tr, props);
  if (props.quote.blocked) {
    return (
      <button ref={ref} type="button" aria-disabled="true" className={DISABLED_TRADE}>
        {label}
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
        {label}
      </button>
      <span role="status" className="text-center text-[12px] text-warn empty:hidden">
        {tried ? tr.soon : ""}
      </span>
    </div>
  );
}
