"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { venueOf } from "../../lib/display";
import { coinOf } from "../../lib/format";
import { PRESETS, plainAmount, quoteTrade, SIM_WALLET, START_AMOUNT, type TradeSide } from "../../lib/trade";
import { BridgeBanner } from "./BridgeBanner";
import { BridgeDialog } from "./BridgeDialog";
import { TradeAction } from "./TradeAction";
import { PayField, ReceiveField } from "./TradeFields";
import type { TradeToken } from "./types";

const SIDE = {
  buy: "border-pos/45 bg-pos/12 text-pos",
  sell: "border-neg/45 bg-neg/12 text-neg",
} as const;

/**
 * Buy and sell, as the export simulates them: no wallet yet, so a buy needs
 * funds bridged in first. Real quotes and swaps come in phase 3.
 */
export function TradePanel({ token, live = false }: { token: TradeToken; live?: boolean }) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const [side, setSide] = useState<TradeSide>("buy");
  const [amount, setAmount] = useState(START_AMOUNT.buy);
  const [balance, setBalance] = useState<number>(SIM_WALLET.native);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [bridged, setBridged] = useState<{ amount: number; provider: string } | null>(null);
  const action = useRef<HTMLButtonElement>(null);

  const buy = side === "buy";
  const coin = coinOf(token.chain);
  const chainName = CHAINS[token.chain].name;
  const quote = quoteTrade({ side, amount, balance, holdingM: SIM_WALLET.tokensM, priceUsd: token.priceUsd, nativeUsd: token.nativeUsd });
  const max = buy ? plainAmount(balance) : String(SIM_WALLET.tokensM);
  const presets = [...PRESETS[side].map((value) => ({ label: value, value })), { label: tr.max, value: max }];
  const venue = venueOf(token, tr.curveVenue);
  const feeLine =
    token.feePct !== null && token.crewPct !== null
      ? fmt(tr.feeCrew, { fee: token.feePct, crew: token.crewPct, venue })
      : fmt(tr.routed, { venue });

  const pick = (next: TradeSide) => {
    setSide(next);
    setAmount(START_AMOUNT[next]);
  };

  if (live) {
    return (
      <section aria-label={tr.label} className="flex flex-col gap-3.5 rounded-3xl border border-line bg-surface p-5 shadow-panel">
        <h2 className="text-[14px] font-semibold">{tr.label}</h2>
        <p className="text-[13px] leading-5 text-text-2">{t.token.live.tradingSoon}</p>
      </section>
    );
  }

  return (
    <section aria-label={tr.label} className="flex flex-col gap-3.5 rounded-3xl border border-line bg-surface p-5 shadow-panel">
      <div role="group" aria-label={tr.side} className="flex gap-1 rounded-[14px] border border-line bg-raised p-1">
        {(["buy", "sell"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={side === id}
            onClick={() => pick(id)}
            className={cn("h-10 flex-1 rounded-[10px] border text-[14px] font-semibold", side === id ? SIDE[id] : "border-transparent text-text-2")}
          >
            {id === "buy" ? tr.buy : tr.sell}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-[18px] text-[14px]">
        <span className="font-semibold">{tr.market}</span>
        <span className="text-text-3">{tr.limit}</span>
        <span className="text-text-3">{tr.autoSell}</span>
        <span className="flex-auto" />
        <SlidersHorizontal size={16} strokeWidth={1.8} className="text-text-3" aria-label={tr.settings} role="img" />
      </div>
      {quote.needsFunds ? <BridgeBanner chainName={chainName} onOpen={() => setBridgeOpen(true)} /> : null}
      {bridged && buy && !quote.needsFunds ? (
        <div role="status" className="tk-in flex items-center gap-2.5 rounded-[14px] border border-pos/35 bg-pos/12 px-3 py-2.5 text-[12px]">
          <Check size={16} strokeWidth={2.6} className="flex-none text-pos" aria-hidden="true" />
          {fmt(tr.toast, { amount: bridged.amount, unit: coin, chain: chainName, provider: bridged.provider })}
        </div>
      ) : null}
      <PayField token={token} side={side} amount={amount} onAmount={setAmount} quote={quote} balance={balance} holdingM={SIM_WALLET.tokensM} />
      <div role="group" aria-label={tr.presets} className="flex gap-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={amount === preset.value}
            onClick={() => setAmount(preset.value)}
            className={cn(
              "h-8 flex-1 rounded-[10px] border font-mono text-[12px] font-semibold",
              amount === preset.value ? "border-accent/55 bg-accent/14 text-accent-text" : "border-line bg-raised text-text-2",
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <ReceiveField token={token} side={side} quote={quote} />
      <div className="grid grid-cols-3 gap-2">
        {[
          [tr.slippage, "15%", ""],
          [tr.priority, tr.fast, "text-accent-text"],
          [tr.mev, tr.on, "text-pos"],
        ].map(([label, value, tone]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-line bg-raised px-2.5 py-2">
            <span className="truncate text-[12px] text-text-3">{label}</span>
            <span className={cn("text-[12px] font-semibold", tone)}>{value}</span>
          </div>
        ))}
      </div>
      <TradeAction ref={action} token={token} side={side} amount={amount} quote={quote} coin={coin} chainName={chainName} />
      <span className="text-center text-[12px] text-text-3">{feeLine}</span>
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
    </section>
  );
}
