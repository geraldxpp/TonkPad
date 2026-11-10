"use client";

import { useId } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatUsd } from "@/shared/lib/format";
import type { ChainId } from "@/shared/types/chain";
import { coinOf } from "../../lib/format";
import { formatTokens, SLIPPAGE, type TradeQuote, type TradeSide } from "../../lib/trade";
import { CoinPill } from "./CoinPill";
import { TradeBox } from "./TradeBox";
import type { TradeToken } from "./types";

const BIG = "font-mono text-[30px] leading-9 font-medium tracking-[-0.045em] max-md:text-[28px]";

interface PayFieldProps {
  token: TradeToken;
  side: TradeSide;
  amount: string;
  onAmount: (value: string) => void;
  quote: TradeQuote;
  /** The line beside the label: "Balance 0.25 ETH on Robinhood Chain", "Checking balance…". */
  balanceText: string;
  /** Shows the balance in the loss colour (an empty wallet on the buy side). */
  empty: boolean;
}

/** The wallet's coin on the token's chain, as the buy side's balance line shows it: "0.25 ETH on Robinhood Chain". */
export function coinOnChain(tr: Dictionary["token"]["trade"], chain: ChainId, amount: string): string {
  return fmt(tr.onChain, { amount, unit: coinOf(chain), chain: CHAINS[chain].name });
}

/** "You pay" (or "You sell"): the amount, the wallet's balance and its USD value. */
export function PayField({ token, side, amount, onAmount, quote, balanceText, empty }: PayFieldProps) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const id = useId();
  const buy = side === "buy";
  const coin = coinOf(token.chain);
  return (
    <TradeBox
      top={
        <>
          <label htmlFor={id}>{buy ? tr.pay : tr.sellAmount}</label>
          <span className={empty ? "text-neg" : undefined}>{balanceText}</span>
        </>
      }
      foot={<span className="font-mono text-[11px] text-text-3">{fmt(tr.approx, { usd: formatUsd(quote.payUsd) })}</span>}
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
export function ReceiveField({ token, side, quote, slippagePct = SLIPPAGE * 100 }: { token: TradeToken; side: TradeSide; quote: TradeQuote; slippagePct?: number }) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const buy = side === "buy";
  const coin = coinOf(token.chain);
  const minimum = buy
    ? fmt(tr.minBuy, { amount: formatTokens(quote.minimum), pct: slippagePct })
    : fmt(tr.minSell, { amount: quote.minimum.toFixed(4), unit: coin });
  return (
    <TradeBox
      tone="receive"
      top={
        <>
          <span>{tr.receive}</span>
          <span>{minimum}</span>
        </>
      }
    >
      <span className="min-w-0 truncate font-mono text-[22px] leading-8 font-medium tracking-[-0.04em]">{buy ? formatTokens(quote.receive) : quote.receive.toFixed(4)}</span>
      {buy ? (
        <CoinPill kind="token" art={token.art} ticker={token.ticker} label={token.ticker} />
      ) : (
        <CoinPill kind="chain" chain={token.chain} label={coin} />
      )}
    </TradeBox>
  );
}
