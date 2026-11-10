"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { SwapToken } from "@/shared/types/swap";
import { TokenArt } from "@/shared/ui/TokenArt";

/** The token beside an amount; a click opens the picker. */
export function TokenButton({ token, fallback, onClick, label }: { token: SwapToken | null; fallback: string; onClick: () => void; label: string }) {
  const symbol = token?.symbol ?? fallback;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`${label}: ${symbol}`}
      className="inline-flex h-10 max-w-[48%] flex-none items-center gap-2 rounded-full border border-line-strong bg-raised pr-2.5 pl-1.5 hover:border-accent/45"
    >
      <TokenArt src={token?.icon ?? ""} label={symbol} size={26} className="size-[26px] flex-none rounded-full object-cover" />
      <span className="truncate font-mono text-[13px] font-semibold">{symbol}</span>
      <ChevronDown size={14} strokeWidth={2} className="flex-none text-text-3" aria-hidden="true" />
    </button>
  );
}

interface AmountBoxProps {
  label: string;
  token: SwapToken | null;
  /** The address shown while the token resolves. */
  fallback: string;
  /** Pay side: the typed text; receive side: the quoted amount. */
  value: string;
  onChange?: (text: string) => void;
  usd: string | null;
  balance: string | null;
  /** Top-right: the 25% / 50% / Max presets, or "Estimated". */
  corner?: ReactNode;
  onPickToken: () => void;
  pickLabel: string;
  /** The receive side while a quote is on its way. */
  pending?: boolean;
}

/** "You pay" / "You receive": the amount, its token, its USD value and the wallet's balance. */
export function AmountBox({ label, token, fallback, value, onChange, usd, balance, corner, onPickToken, pickLabel, pending = false }: AmountBoxProps) {
  const { t } = useI18n();
  const id = useId();
  const editable = onChange !== undefined;
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line-strong bg-bg/50 p-4 max-md:p-3.5">
      <div className="flex min-h-5 items-center justify-between gap-2 text-[12px] text-text-3">
        {editable ? <label htmlFor={id}>{label}</label> : <span id={id}>{label}</span>}
        {corner}
      </div>
      <div className="flex min-h-12 items-center justify-between gap-3">
        {editable ? (
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full min-w-0 bg-transparent font-mono text-[32px] leading-10 font-medium tracking-[-0.05em] text-text placeholder:text-text-3 focus-visible:outline-none max-md:text-[28px]"
          />
        ) : (
          <output
            aria-labelledby={id}
            aria-busy={pending || undefined}
            className={cn(
              "min-w-0 truncate font-mono text-[28px] leading-10 font-medium tracking-[-0.05em] max-md:text-[24px]",
              pending ? "text-text-3" : "text-text",
            )}
          >
            {value || "0"}
          </output>
        )}
        <TokenButton token={token} fallback={fallback} onClick={onPickToken} label={pickLabel} />
      </div>
      <div className="flex min-h-4 items-center justify-between gap-2 font-mono text-[11px] text-text-3">
        <span>{usd ?? ""}</span>
        <span>{balance === null ? "" : `${t.swap.balanceLabel} ${balance}`}</span>
      </div>
    </div>
  );
}
