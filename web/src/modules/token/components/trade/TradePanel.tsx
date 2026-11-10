"use client";

import { Check } from "lucide-react";
import { useRef, useState } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { coinOf } from "../../lib/format";
import { plainAmount, quoteTrade, SIM_WALLET } from "../../lib/trade";
import { BridgeBanner } from "./BridgeBanner";
import { BridgeDialog } from "./BridgeDialog";
import { TradeAction } from "./TradeAction";
import { FeeLine, PresetRow, SettingsRow, SideAndOrder, useTradeSide } from "./TradeControls";
import { coinOnChain, PayField, ReceiveField } from "./TradeFields";
import { TradeCard } from "./TradeCard";
import type { TradePanelProps } from "./types";

/**
 * Buy and sell on mock data, as the export simulates them: a pretend wallet
 * with nothing on the token's chain, so a buy needs funds bridged in first.
 * Live tokens use LiveTradePanel, with the connected wallet's real balances.
 */
export function TradePanel({ token, initialSide, onClose }: TradePanelProps) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const { side, pick, amount, setAmount } = useTradeSide(initialSide);
  const [balance, setBalance] = useState<number>(SIM_WALLET.native);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [bridged, setBridged] = useState<{ amount: number; provider: string } | null>(null);
  const action = useRef<HTMLButtonElement>(null);

  const buy = side === "buy";
  const coin = coinOf(token.chain);
  const chainName = CHAINS[token.chain].name;
  const quote = quoteTrade({ side, amount, balance, holdingM: SIM_WALLET.tokensM, priceUsd: token.priceUsd, nativeUsd: token.nativeUsd });
  const held = buy ? coinOnChain(tr, token.chain, plainAmount(balance)) : `${SIM_WALLET.tokensM}M ${token.ticker}`;

  return (
    <TradeCard name={token.name} onClose={onClose}>
      <SideAndOrder side={side} onSide={pick} chain={token.chain} />
      {quote.needsFunds ? <BridgeBanner chainName={chainName} onOpen={() => setBridgeOpen(true)} /> : null}
      {bridged && buy && !quote.needsFunds ? (
        <div role="status" className="tk-in flex items-center gap-2.5 rounded-[14px] border border-pos/35 bg-pos/12 px-3 py-2.5 text-[12px]">
          <Check size={16} strokeWidth={2.6} className="flex-none text-pos" aria-hidden="true" />
          {fmt(tr.toast, { amount: bridged.amount, unit: coin, chain: chainName, provider: bridged.provider })}
        </div>
      ) : null}
      <PayField
        token={token}
        side={side}
        amount={amount}
        onAmount={setAmount}
        quote={quote}
        balanceText={fmt(tr.balance, { amount: held })}
        empty={buy && balance === 0}
      />
      <PresetRow side={side} amount={amount} max={buy ? plainAmount(balance) : String(SIM_WALLET.tokensM)} onAmount={setAmount} />
      <ReceiveField token={token} side={side} quote={quote} />
      <SettingsRow />
      <TradeAction ref={action} token={token} side={side} amount={amount} quote={quote} coin={coin} chainName={chainName} />
      <FeeLine token={token} />
      <BridgeDialog
        open={bridgeOpen}
        chain={token.chain}
        tokenName={token.name}
        ticker={token.ticker}
        nativeUsd={token.nativeUsd}
        onClose={() => setBridgeOpen(false)}
        onBridged={(landed, provider) => {
          setBridgeOpen(false);
          setBalance((was) => +(was + landed).toFixed(4));
          setBridged({ amount: landed, provider });
          requestAnimationFrame(() => action.current?.focus());
        }}
      />
    </TradeCard>
  );
}
