"use client";

import { ArrowDownUp, Eye, SlidersHorizontal, Wallet } from "lucide-react";
import { type RefObject, useId, useState } from "react";
import { CHAINS, CHAIN_IDS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { pctText, type QuoteView } from "@/shared/swap/display";
import { useRecentSwaps } from "@/shared/swap/recent";
import { ChainMark } from "@/shared/ui/ChainMark";
import { SLIPPAGE_OPTIONS } from "@/shared/swap/slippage";
import type { SwapForm } from "../hooks/useSwapForm";
import { AmountBox } from "./AmountBox";
import { QuoteDetails } from "./QuoteDetails";
import { RecentList } from "./RecentList";
import { type ActionState, SwapAction } from "./SwapAction";

interface SwapCardProps {
  form: SwapForm;
  view: QuoteView | null;
  loading: boolean;
  balances: { pay: string | null; receive: string | null };
  presets: { label: string; pct: number }[];
  onPreset: (pct: number) => void;
  onPick: (side: "from" | "to") => void;
  action: ActionState;
  connecting: boolean;
  onConnect: () => void;
  onReview: () => void;
  actionRef: RefObject<HTMLDivElement | null>;
}

const TAB = "relative flex h-full items-center gap-2 text-[14px] font-semibold";

/** The swap card: Swap / Recent, the network and slippage, both amounts, the quote and the main button. */
export function SwapCard({ actionRef, ...props }: SwapCardProps) {
  const { form, view, loading, balances } = props;
  const { t } = useI18n();
  const s = t.swap;
  const id = useId();
  const [tab, setTab] = useState<"swap" | "recent">("swap");
  const [settings, setSettings] = useState(false);
  const recent = useRecentSwaps();
  const tabProps = (value: "swap" | "recent") => ({
    role: "tab" as const,
    id: `${id}-${value}`,
    "aria-selected": tab === value,
    "aria-controls": `${id}-panel`,
    tabIndex: tab === value ? 0 : -1,
    onClick: () => setTab(value),
    className: cn(TAB, tab === value ? "text-text after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent" : "text-text-3 hover:text-text"),
  });
  return (
    <section aria-label={s.tab} className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-card">
      <div className="flex h-[60px] items-center justify-between border-b border-line px-6 max-md:px-4">
        <div
          role="tablist"
          aria-label={s.tab}
          className="flex h-full items-center gap-6"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? "swap" : event.key === "End" ? "recent" : tab === "swap" ? "recent" : "swap";
            setTab(next);
            document.getElementById(`${id}-${next}`)?.focus();
          }}
        >
          <button type="button" {...tabProps("swap")}>{s.tab}</button>
          <button type="button" {...tabProps("recent")}>
            {s.recent}
            <span className="rounded bg-raised px-1.5 font-mono text-[10px] text-text-3">{recent.length}</span>
          </button>
        </div>
        <button
          type="button"
          aria-expanded={settings}
          aria-controls={`${id}-settings`}
          onClick={() => setSettings((open) => !open)}
          aria-label={s.settings}
          title={s.settings}
          className="inline-flex size-9 items-center justify-center rounded-lg text-text-3 hover:bg-raised hover:text-text aria-expanded:bg-raised aria-expanded:text-accent-text"
        >
          <SlidersHorizontal size={17} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>
      {settings ? (
        <div id={`${id}-settings`} className="flex flex-col gap-2.5 border-b border-line bg-bg/40 px-6 py-4 max-md:px-4">
          <span className="text-[12px] font-semibold">{s.slippageTitle}</span>
          <div role="group" aria-label={s.slippageTitle} className="flex gap-1.5">
            {SLIPPAGE_OPTIONS.map((bps) => (
              <button
                key={bps}
                type="button"
                aria-pressed={form.slippageBps === bps}
                onClick={() => form.setSlippage(bps)}
                className={cn("h-8 flex-1 rounded-md border font-mono text-[12px]", form.slippageBps === bps ? "border-accent/45 bg-accent/8 text-accent-text" : "border-line bg-raised text-text-2 hover:text-text")}
              >
                {pctText(bps)}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-text-3">{s.slippageHint}</span>
        </div>
      ) : null}
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
        {tab === "recent" ? (
          <RecentList onStart={() => setTab("swap")} />
        ) : (
          <div className="flex flex-col px-6 pt-4 pb-6 max-md:px-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-4">
              <div role="group" aria-label={s.network} className="flex gap-1 rounded-lg border border-line bg-raised p-0.5">
                {CHAIN_IDS.map((chain) => (
                  <button
                    key={chain}
                    type="button"
                    aria-pressed={form.chain === chain}
                    onClick={() => form.setChain(chain)}
                    className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium whitespace-nowrap", form.chain === chain ? "bg-input text-text" : "text-text-3 hover:text-text")}
                  >
                    <ChainMark chain={chain} size={15} letterSize={8} decorative />
                    {CHAINS[chain].name}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setSettings(true)} className="inline-flex items-center gap-1.5 rounded text-[11px] whitespace-nowrap text-text-3 hover:text-text">
                <SlidersHorizontal size={12} strokeWidth={2} aria-hidden="true" />
                <span className="font-mono text-text-2">{fmt(s.slippage, { pct: pctText(form.slippageBps) })}</span>
              </button>
            </div>
            <div className="relative flex flex-col gap-1.5">
              <AmountBox
                label={s.pay}
                token={form.from}
                fallback="…"
                value={form.amount}
                onChange={form.setAmount}
                usd={view?.inUsd ?? null}
                balance={balances.pay}
                pickLabel={s.chooseToken}
                onPickToken={() => props.onPick("from")}
                corner={
                  balances.pay !== null ? (
                    <span role="group" aria-label={s.presets} className="flex gap-1">
                      {props.presets.map((preset) => (
                        <button key={preset.pct} type="button" onClick={() => props.onPreset(preset.pct)} className="rounded px-1.5 py-0.5 font-mono text-[11px] text-text-3 hover:bg-raised hover:text-accent-text">
                          {preset.label}
                        </button>
                      ))}
                    </span>
                  ) : null
                }
              />
              <button
                type="button"
                onClick={form.flip}
                aria-label={s.flip}
                title={s.flip}
                className="absolute top-1/2 left-1/2 z-[1] inline-flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border border-line-strong bg-surface text-accent-text hover:bg-raised"
              >
                <ArrowDownUp size={16} strokeWidth={2} aria-hidden="true" />
              </button>
              <AmountBox
                label={s.receive}
                token={form.to}
                fallback="…"
                value={view?.out ?? ""}
                usd={view?.outUsd ?? null}
                balance={balances.receive}
                pending={loading}
                pickLabel={s.chooseToken}
                onPickToken={() => props.onPick("to")}
                corner={<span className="text-[11px] text-text-3">{s.estimated}</span>}
              />
            </div>
            {form.from && form.to ? <QuoteDetails view={view} from={form.from} to={form.to} slippageBps={form.slippageBps} loading={loading} /> : null}
            <div ref={actionRef} className="mt-5 flex flex-col gap-3">
              <SwapAction state={props.action} connecting={props.connecting} onConnect={props.onConnect} onReview={props.onReview} />
              <p className="m-0 flex items-center justify-center gap-1.5 text-center text-[11px] text-text-3">{s.signNote}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** The two promises under the card. */
export function SwapAssurance() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-text-3">
      <span className="inline-flex items-center gap-1.5">
        <Eye size={14} strokeWidth={1.9} aria-hidden="true" />
        {t.swap.assureReview}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Wallet size={14} strokeWidth={1.9} aria-hidden="true" />
        {t.swap.assureWallet}
      </span>
    </div>
  );
}

