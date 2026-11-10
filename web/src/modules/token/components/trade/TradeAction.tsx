"use client";

import { ArrowRight } from "lucide-react";
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
export const DISABLED_TRADE = "min-h-11 cursor-not-allowed rounded-lg border border-line-strong bg-input px-3 py-2 text-[13px] font-semibold text-text-2";

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
          "inline-flex min-h-11 items-center justify-between gap-2 rounded-lg px-4 py-2 text-left text-[13px] font-semibold hover:brightness-110",
          buy ? "bg-cta text-on-cta" : "bg-neg text-[var(--badge-on-alert)]",
        )}
      >
        {label}
        <ArrowRight size={16} strokeWidth={2} className="flex-none" aria-hidden="true" />
      </button>
      <span role="status" className="text-center text-[11px] text-warn empty:hidden">
        {tried ? tr.soon : ""}
      </span>
    </div>
  );
}
