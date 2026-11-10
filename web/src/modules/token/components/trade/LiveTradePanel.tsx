"use client";

import { useState } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatCompact } from "@/shared/swap/amounts";
import { pctText } from "@/shared/swap/display";
import { SwapReview } from "@/shared/swap/SwapReview";
import { useSwapRun } from "@/shared/swap/useSwapRun";
import { floorUnits, formatBalance, toUnits } from "@/shared/wallet/units";
import { useWalletBalances } from "@/shared/wallet/useWalletBalances";
import { useLiveTrade } from "../../hooks/useLiveTrade";
import { coinOf } from "../../lib/format";
import { formatTokens, quoteTrade, type TradeQuote } from "../../lib/trade";
import { LiveTradeAction } from "./LiveTradeAction";
import { FeeLine, PresetRow, SettingsRow, SideAndOrder, useTradeSide } from "./TradeControls";
import { coinOnChain, PayField, ReceiveField } from "./TradeFields";
import { TradeCard } from "./TradeCard";
import type { TradePanelProps } from "./types";

/**
 * The trade panel on live tokens: the connected wallet's real coin and
 * holding of this token, a real quote from the swap engine, and (once
 * trading is open) a review that has the wallet sign the swap. While the
 * go-live switch is off the button stays disabled and nothing is signed.
 */
export function LiveTradePanel({ token, initialSide, onClose }: TradePanelProps) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const { side, pick, amount, setAmount } = useTradeSide(initialSide);
  const funds = useWalletBalances(token.chain, token.address);
  const buy = side === "buy";
  const coin = coinOf(token.chain);

  const native = funds.balances?.native ?? null;
  const held = funds.balances?.token?.amount ?? null;
  const estimate = quoteTrade({
    side,
    amount,
    balance: native ? toUnits(native) : 0,
    holdingM: held ? toUnits(held) / 1e6 : 0,
    priceUsd: token.priceUsd,
    nativeUsd: token.nativeUsd,
  });
  const { request, live, from, to, slippageBps } = useLiveTrade(token, side, amount, funds.owner);
  // The real quote replaces the estimate as soon as it arrives.
  const quote: TradeQuote =
    live.quote && to
      ? {
          ...estimate,
          receive: toUnits({ raw: live.quote.outAmount, decimals: to.decimals }),
          minimum: toUnits({ raw: live.quote.minOut, decimals: to.decimals }),
          payUsd: live.quote.inUsd ?? estimate.payUsd,
        }
      : estimate;
  const shownAmount = buy ? amount : `${amount}M`;
  const [reviewing, setReviewing] = useState(false);
  const { state: run, run: start, reset } = useSwapRun();
  const confirm = () => {
    if (!request || !funds.owner || !from || !to) return;
    const received = live.quote ? formatCompact({ raw: live.quote.outAmount, decimals: to.decimals }) : "";
    void start({ ...request, taker: funds.owner }, { from: { symbol: from.symbol, amount: shownAmount }, to: { symbol: to.symbol, amount: received } });
  };

  const balanceText = !funds.owner
    ? fmt(tr.balance, { amount: "—" })
    : funds.loading
      ? tr.checking
      : funds.failed
        ? tr.balanceFailed
        : fmt(tr.balance, { amount: buy ? coinOnChain(tr, token.chain, native ? formatBalance(native) : "0") : `${formatTokens(held ? toUnits(held) : 0)} ${token.ticker}` });
  const max = buy ? (native ? floorUnits(native) : "0") : held ? floorUnits(held, 6) : "0";

  return (
    <TradeCard name={token.name} onClose={onClose}>
      <SideAndOrder side={side} onSide={pick} chain={token.chain} />
      <PayField
        token={token}
        side={side}
        amount={amount}
        onAmount={setAmount}
        quote={quote}
        balanceText={balanceText}
        empty={buy && native !== null && native.raw === "0"}
      />
      <PresetRow side={side} amount={amount} max={max} onAmount={setAmount} />
      <ReceiveField token={token} side={side} quote={quote} slippagePct={slippageBps / 100} />
      <SettingsRow slippage={pctText(slippageBps)} />
      <LiveTradeAction
        token={token}
        side={side}
        amount={amount}
        quote={quote}
        coin={coin}
        chainName={CHAINS[token.chain].name}
        owner={funds.owner}
        live={{ ready: live.quote !== null, tradingOpen: live.tradingOpen, error: live.error, loading: live.loading }}
        onReview={() => setReviewing(true)}
      />
      <FeeLine token={token} />
      {from && to ? (
        <SwapReview
          open={reviewing}
          onClose={() => {
            setReviewing(false);
            reset();
          }}
          from={from}
          to={to}
          amount={shownAmount}
          quote={live.quote}
          run={run}
          onConfirm={confirm}
        />
      ) : null}
    </TradeCard>
  );
}
