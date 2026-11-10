"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { ChainId } from "@/shared/types/chain";
import { ChainMark } from "@/shared/ui/ChainMark";
import { venueOf } from "../../lib/display";
import { PRESETS, START_AMOUNT, type TradeSide } from "../../lib/trade";
import type { TradeToken } from "./types";

const SIDE = {
  buy: "bg-accent/14 text-accent-text",
  sell: "bg-neg/12 text-neg",
} as const;

/** The side and the amount typed for it; switching sides starts from that side's opening amount. */
export function useTradeSide(initial: TradeSide = "buy") {
  const [side, setSide] = useState<TradeSide>(initial);
  const [amount, setAmount] = useState(START_AMOUNT[initial]);
  const pick = (next: TradeSide) => {
    setSide(next);
    setAmount(START_AMOUNT[next]);
  };
  return { side, pick, amount, setAmount };
}

/** Buy / Sell, then the order type (a market order) and the token's chain. */
export function SideAndOrder({ side, onSide, chain }: { side: TradeSide; onSide: (side: TradeSide) => void; chain: ChainId }) {
  const { t } = useI18n();
  const tr = t.token.trade;
  return (
    <>
      <div role="group" aria-label={tr.side} className="grid grid-cols-2 gap-1 rounded-[10px] border border-line bg-bg p-1">
        {(["buy", "sell"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={side === id}
            onClick={() => onSide(id)}
            className={cn("h-9 rounded-md text-[13px] font-semibold", side === id ? SIDE[id] : "text-text-3 hover:text-text")}
          >
            {id === "buy" ? tr.buy : tr.sell}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] text-text-3">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-[5px] rounded-full bg-accent" />
          {tr.marketOrder}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <ChainMark chain={chain} size={13} letterSize={7} decorative />
          <span className="truncate">{CHAINS[chain].name}</span>
        </span>
      </div>
    </>
  );
}

/** The side's preset amounts and Max (whatever the wallet holds). */
export function PresetRow({ side, amount, max, onAmount }: { side: TradeSide; amount: string; max: string; onAmount: (value: string) => void }) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const presets = [...PRESETS[side].map((value) => ({ label: value, value })), { label: tr.max, value: max }];
  return (
    <div role="group" aria-label={tr.presets} className="flex gap-1.5">
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          aria-pressed={amount === preset.value}
          onClick={() => onAmount(preset.value)}
          className={cn(
            "h-[30px] min-w-0 flex-1 rounded-md border font-mono text-[11px] font-medium",
            amount === preset.value ? "border-accent/45 bg-accent/8 text-accent-text" : "border-line bg-raised text-text-2 hover:text-accent-text",
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

/** Slippage, priority and MEV shield in one quiet line. */
export function SettingsRow() {
  const { t } = useI18n();
  const tr = t.token.trade;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-text-3">
      <span>
        {tr.slippage} <span className="font-mono text-text-2">15%</span>
      </span>
      <span>
        {tr.priority} <span className="text-accent-text">{tr.fast}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <ShieldCheck size={12} strokeWidth={2} className="text-pos" aria-hidden="true" />
        {tr.mev} <span className="text-pos">{tr.on}</span>
      </span>
    </div>
  );
}

/** "Fee 2.5% · 2% goes to the crew · routed via Tonkpad curve", or just the route. */
export function FeeLine({ token }: { token: TradeToken }) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const venue = venueOf(token, tr.curveVenue);
  const text =
    token.feePct !== null && token.crewPct !== null
      ? fmt(tr.feeCrew, { fee: token.feePct, crew: token.crewPct, venue })
      : fmt(tr.routed, { venue });
  return <span className="text-center text-[11px] text-text-3">{text}</span>;
}
