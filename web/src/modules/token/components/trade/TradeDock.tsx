"use client";

import { ArrowUpRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { TradeSide } from "../../lib/trade";
import { LiveTradePanel } from "./LiveTradePanel";
import { TradePanel } from "./TradePanel";
import type { TradeToken } from "./types";

interface TradeDockProps {
  token: TradeToken;
  live: boolean;
  /** The price (or "—") beside the buttons. */
  price: string;
  /** What the price is counted in, when it isn't dollars: set beside the ticker, so the figure itself stays whole. */
  unit?: string;
  /** A trade form of the page's own, in place of the usual ones (a mission's curve). */
  panel?: (side: TradeSide, close: () => void) => ReactNode;
  /** Shown above the buttons: a sent trade's progress, which outlives the sheet. */
  notice?: ReactNode;
  /** Why trading is on hold (the launchpad's pause): said above the buttons, and Buy no longer looks ready. */
  paused?: string;
}

/**
 * Phones only: Buy and Sell in a bar fixed to the bottom edge (in place of the
 * tab bar), beside the price. Each opens the trade form in a sheet on that
 * side; Escape, Close or the backdrop dismiss it and focus returns to the
 * button that opened it.
 */
export function TradeDock({ token, live, price, unit, panel, notice, paused }: TradeDockProps) {
  const { t } = useI18n();
  const tr = t.token.trade;
  const [side, setSide] = useState<TradeSide | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (side && !el.open) el.showModal();
    if (!side && el.open) el.close();
  }, [side]);

  const open = (next: TradeSide, button: HTMLButtonElement) => {
    opener.current = button;
    setSide(next);
  };
  const close = () => setSide(null);
  const Panel = live ? LiveTradePanel : TradePanel;
  return (
    <>
      <div
        role="region"
        aria-label={fmt(tr.title, { name: token.name })}
        className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2.5 border-t border-line bg-bg-deep/95 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      >
        {notice ?? (paused ? <p className="m-0 text-[12px] leading-[1.5] font-semibold text-warn">{paused}</p> : null)}
        <div className="flex items-center gap-2.5">
          <div className="flex min-w-0 flex-auto flex-col">
            <span className="truncate font-mono text-[10px] text-text-3">{unit ? `${token.ticker} · ${unit}` : token.ticker}</span>
            <span className="truncate font-mono text-[15px] leading-5 font-semibold">{price}</span>
          </div>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={(event) => open("sell", event.currentTarget)}
            className="h-11 flex-none rounded-lg border border-line-strong bg-surface px-5 text-[14px] font-semibold"
          >
            {tr.sell}
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={(event) => open("buy", event.currentTarget)}
            className={cn("inline-flex h-11 flex-none items-center gap-2 rounded-lg px-5 text-[14px] font-semibold", paused ? "border border-line-strong bg-surface text-text-2" : "bg-cta text-on-cta")}
          >
            {tr.buy}
            <ArrowUpRight size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </div>
      <dialog
        ref={dialog}
        aria-label={fmt(tr.title, { name: token.name })}
        onClose={() => {
          setSide(null);
          opener.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="mt-auto mb-0 max-h-[92dvh] w-full max-w-none overflow-y-auto bg-transparent p-0 text-text backdrop:bg-[var(--scrim)] md:hidden [&>section]:rounded-b-none [&>section]:border-b-0 [&>section]:pb-[calc(16px+env(safe-area-inset-bottom))]"
      >
        {side ? (panel ? panel(side, close) : <Panel key={side} token={token} initialSide={side} onClose={close} />) : null}
      </dialog>
    </>
  );
}
