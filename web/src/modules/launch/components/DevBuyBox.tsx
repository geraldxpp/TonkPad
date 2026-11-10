"use client";

import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { devBuyPresets, devBuyQuote, maxDevBuy, percentOf, TOTAL_SUPPLY } from "@/shared/tonk/curve";
import { ethInputText, formatEth, formatTokens, percentText } from "@/shared/tonk/format";
import type { StudioProps } from "./types";

/**
 * The initial dev buy: None and three presets sized to the launchpad's
 * reserve (each says the share of supply it buys), or a typed amount.
 */
export function DevBuyBox({ state, view, settings, unit }: StudioProps) {
  const { t } = useI18n();
  const b = t.launch.basics;
  const id = "launch-devBuy";
  const { form, set } = state;
  const error = state.showsError("devBuy") ? fmt(t.launch.errors.devBuy, { max: `${formatEth(maxDevBuy(settings))} ${unit}` }) : null;
  const presets = devBuyPresets(settings).map((wei) => ({ text: ethInputText(wei), share: percentOf(devBuyQuote(settings, wei, form.creator).tokensOut, TOTAL_SUPPLY) }));
  const ticker = form.ticker.trim();
  return (
    <div className="mt-6 rounded-xl border border-line bg-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-[13px] font-semibold">{b.devBuy}</h3>
        <span className="text-[11px] text-text-3">{b.devBuyOptional}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-stretch gap-2.5">
        <div className="flex min-w-[180px] flex-[1_1_240px] items-center gap-2 rounded-lg border border-line-strong bg-bg px-3 py-2.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cta">
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            value={form.devBuy}
            onChange={(event) => set("devBuy", event.target.value)}
            onBlur={() => state.touch("devBuy")}
            aria-label={fmt(b.devBuyAmount, { unit })}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-help`}
            placeholder="0"
            className="w-full min-w-0 border-0 bg-transparent p-0 font-mono text-[24px] leading-8 font-medium tracking-[-0.03em] text-text outline-none placeholder:text-text-3"
          />
          <span className="flex-none font-mono text-[12px] text-text-2">{unit}</span>
        </div>
        <div role="group" aria-label={b.devBuy} className="grid flex-[1_1_240px] grid-cols-4 gap-1.5 md:max-w-[340px]">
          <button
            type="button"
            aria-pressed={!view.hasBuy}
            onClick={() => set("devBuy", "0")}
            className="min-h-11 rounded-lg border border-line-strong bg-surface px-1.5 font-mono text-[12px] text-text-3 aria-pressed:border-accent/50 aria-pressed:bg-accent/8 aria-pressed:text-accent-text"
          >
            {b.none}
          </button>
          {presets.map((preset) => (
            <button
              key={preset.text}
              type="button"
              aria-pressed={form.devBuy === preset.text}
              onClick={() => set("devBuy", preset.text)}
              title={fmt(b.ofSupply, { pct: percentText(preset.share, 1) })}
              className="flex min-h-11 min-w-0 flex-col items-center justify-center rounded-lg border border-line-strong bg-surface px-1 font-mono text-[12px] leading-4 text-text-3 aria-pressed:border-accent/50 aria-pressed:bg-accent/8 aria-pressed:text-accent-text"
            >
              <span className="max-w-full truncate">{preset.text}</span>
              <span className="text-[10px] opacity-80">{percentText(preset.share, 1)}</span>
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p role="alert" className="m-0 mt-2 text-[12px] text-neg">
          {error}
        </p>
      ) : null}
      <p className={cn("m-0 mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-text-2", !view.hasBuy && "hidden")}>
        <strong className="font-semibold text-text">{formatTokens(view.bought)}</strong>
        {ticker ? <span>${ticker}</span> : null}
        <span aria-hidden="true" className="size-[3px] rounded-full bg-text-3" />
        <span>{fmt(b.ofSupply, { pct: percentText(view.supplyPct) })}</span>
      </p>
      <p id={`${id}-help`} className="m-0 mt-2 text-[11px] leading-[1.7] text-text-3">
        {b.devBuyHelp}
      </p>
      {!view.hasBuy ? <p className="m-0 mt-2.5 rounded-lg bg-warn/7 p-2.5 text-[12px] leading-[1.6] text-warn">{b.zeroNote}</p> : null}
    </div>
  );
}
