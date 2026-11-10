"use client";

import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { floorUnits, formatBalance, toUnits } from "@/shared/wallet/units";
import { useWalletBalances } from "@/shared/wallet/useWalletBalances";
import { coinOf } from "../../lib/format";
import { formatTokens, quoteTrade } from "../../lib/trade";
import { LiveTradeAction } from "./LiveTradeAction";
import { FeeLine, PresetRow, SettingsRow, SideAndOrder, useTradeSide } from "./TradeControls";
import { coinOnChain, PayField, ReceiveField } from "./TradeFields";
import type { TradeToken } from "./types";

/**
 * The trade panel on live tokens: the connected wallet's real coin and
 * holding of this token, read through the app's server. Trading isn't open
 * yet, so the trade button stays disabled and nothing is ever signed.
 */
export function LiveTradePanel({ token }: { token: TradeToken }) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const { side, pick, amount, setAmount } = useTradeSide();
  const funds = useWalletBalances(token.chain, token.address);
  const buy = side === "buy";
  const coin = coinOf(token.chain);

  const native = funds.balances?.native ?? null;
  const held = funds.balances?.token?.amount ?? null;
  const quote = quoteTrade({
    side,
    amount,
    balance: native ? toUnits(native) : 0,
    holdingM: held ? toUnits(held) / 1e6 : 0,
    priceUsd: token.priceUsd,
    nativeUsd: token.nativeUsd,
  });

  const balanceText = !funds.owner
    ? fmt(tr.balance, { amount: "—" })
    : funds.loading
      ? tr.checking
      : funds.failed
        ? tr.balanceFailed
        : fmt(tr.balance, { amount: buy ? coinOnChain(tr, token.chain, native ? formatBalance(native) : "0") : `${formatTokens(held ? toUnits(held) : 0)} ${token.ticker}` });
  const max = buy ? (native ? floorUnits(native) : "0") : held ? floorUnits(held, 6) : "0";

  return (
    <section aria-label={tr.label} className="flex flex-col gap-3.5 rounded-3xl border border-line bg-surface p-5 shadow-panel">
      <SideAndOrder side={side} onSide={pick} />
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
      <ReceiveField token={token} side={side} quote={quote} />
      <SettingsRow />
      <LiveTradeAction
        token={token}
        side={side}
        amount={amount}
        quote={quote}
        coin={coin}
        chainName={CHAINS[token.chain].name}
        owner={funds.owner}
      />
      <FeeLine token={token} />
    </section>
  );
}
