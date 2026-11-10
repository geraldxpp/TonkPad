"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { venueOf } from "../../lib/display";
import { PRESETS, START_AMOUNT, type TradeSide } from "../../lib/trade";
import type { TradeToken } from "./types";

const SIDE = {
  buy: "border-pos/45 bg-pos/12 text-pos",
  sell: "border-neg/45 bg-neg/12 text-neg",
} as const;

/** The side and the amount typed for it; switching sides starts from that side's opening amount. */
export function useTradeSide() {
  const [side, setSide] = useState<TradeSide>("buy");
  const [amount, setAmount] = useState(START_AMOUNT.buy);
  const pick = (next: TradeSide) => {
    setSide(next);
    setAmount(START_AMOUNT[next]);
  };
  return { side, pick, amount, setAmount };
}

/** Buy / Sell, then the order types (only Market for now) and the settings mark. */
export function SideAndOrder({ side, onSide }: { side: TradeSide; onSide: (side: TradeSide) => void }) {
  const { t } = useI18n();
  const tr = t.token.trade;
  return (
    <>
      <div role="group" aria-label={tr.side} className="flex gap-1 rounded-[14px] border border-line bg-raised p-1">
        {(["buy", "sell"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={side === id}
            onClick={() => onSide(id)}
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
    </>
  );
}

/** The side's preset amounts and Max (whatever the wallet holds). */
export function PresetRow({ side, amount, max, onAmount }: { side: TradeSide; amount: string; max: string; onAmount: (value: string) => void }) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const presets = [...PRESETS[side].map((value) => ({ label: value, value })), { label: tr.max, value: max }];
  return (
    <div role="group" aria-label={tr.presets} className="flex gap-2">
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          aria-pressed={amount === preset.value}
          onClick={() => onAmount(preset.value)}
          className={cn(
            "h-8 flex-1 rounded-[10px] border font-mono text-[12px] font-semibold",
            amount === preset.value ? "border-accent/55 bg-accent/14 text-accent-text" : "border-line bg-raised text-text-2",
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

/** Slippage, priority and MEV shield, as the export shows them. */
export function SettingsRow() {
  const { t } = useI18n();
  const tr = t.token.trade;
  return (
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
  return <span className="text-center text-[12px] text-text-3">{text}</span>;
}
