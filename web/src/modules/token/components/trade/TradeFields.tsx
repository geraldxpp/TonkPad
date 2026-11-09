"use client";

import { useId } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatUsd } from "@/shared/lib/format";
import { coinOf } from "../../lib/format";
import { formatTokens, plainAmount, SLIPPAGE, type TradeQuote, type TradeSide } from "../../lib/trade";
import { CoinPill } from "./CoinPill";
import { TradeBox } from "./TradeBox";
import type { TradeToken } from "./types";

const BIG = "font-mono text-[36px] leading-[44px] font-semibold tracking-[-0.03em] max-md:text-[30px]";

interface PayFieldProps {
  token: TradeToken;
  side: TradeSide;
  amount: string;
  onAmount: (value: string) => void;
  quote: TradeQuote;
  balance: number;
  holdingM: number;
}

/** "You pay" (or "You sell"): the amount, the wallet's balance and its USD value. */
export function PayField({ token, side, amount, onAmount, quote, balance, holdingM }: PayFieldProps) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const id = useId();
  const buy = side === "buy";
  const coin = coinOf(token.chain);
  const held = buy ? fmt(tr.onChain, { amount: plainAmount(balance), unit: coin, chain: CHAINS[token.chain].name }) : `${holdingM}M ${token.ticker}`;
  return (
    <TradeBox
      top={
        <>
          <label htmlFor={id}>{buy ? tr.pay : tr.sellAmount}</label>
          <span className={buy && balance === 0 ? "text-neg" : undefined}>{fmt(tr.balance, { amount: held })}</span>
        </>
      }
      foot={<span className="font-mono text-[12px] text-text-3">{fmt(tr.approx, { usd: formatUsd(quote.payUsd) })}</span>}
    >
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={amount}
        onChange={(event) => onAmount(event.target.value)}
        className={`${BIG} w-full min-w-0 flex-auto bg-transparent text-text [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
      />
      {buy ? (
        <CoinPill kind="chain" chain={token.chain} label={coin} />
      ) : (
        <CoinPill kind="token" art={token.art} ticker={token.ticker} label={`M ${token.ticker}`} />
      )}
    </TradeBox>
  );
}

/** "You receive", with the minimum after slippage. */
export function ReceiveField({ token, side, quote }: { token: TradeToken; side: TradeSide; quote: TradeQuote }) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const buy = side === "buy";
  const coin = coinOf(token.chain);
  const minimum = buy
    ? fmt(tr.minBuy, { amount: formatTokens(quote.minimum), pct: SLIPPAGE * 100 })
    : fmt(tr.minSell, { amount: quote.minimum.toFixed(4), unit: coin });
  return (
    <TradeBox
      top={
        <>
          <span>{tr.receive}</span>
          <span>{minimum}</span>
        </>
      }
    >
      <span className={`${BIG} min-w-0 truncate`}>{buy ? formatTokens(quote.receive) : quote.receive.toFixed(4)}</span>
      {buy ? (
        <CoinPill kind="token" art={token.art} ticker={token.ticker} label={token.ticker} />
      ) : (
        <CoinPill kind="chain" chain={token.chain} label={coin} />
      )}
    </TradeBox>
  );
}
