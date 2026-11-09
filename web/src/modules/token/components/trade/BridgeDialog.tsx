"use client";

import { ArrowRight, ArrowRightLeft, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { ChainId } from "@/shared/types/chain";
import { ChainMark } from "@/shared/ui/ChainMark";
import { IconButton } from "@/shared/ui/IconButton";
import { type BridgeSource, LANDS, SOURCES, sendAmount, sourcesFor } from "../../lib/bridge";
import { coinOf } from "../../lib/format";

interface BridgeDialogProps {
  open: boolean;
  chain: ChainId;
  tokenName: string;
  ticker: string;
  nativeUsd: number;
  onClose: () => void;
  /** The bridge went through (simulated): what landed, and who carried it. */
  onBridged: (amount: number, provider: string) => void;
}

/** Source mark: the app's own chain logo, or the letter on the chain's colour. */
function SourceMark({ source }: { source: BridgeSource }) {
  if (source === "sol" || source === "rh") return <ChainMark chain={source} size={20} letterSize={9} decorative />;
  const info = SOURCES[source];
  return (
    <span aria-hidden="true" className="inline-flex size-5 items-center justify-center rounded-full text-[9px] font-bold" style={{ background: info.background, color: info.foreground }}>
      {info.letter}
    </span>
  );
}

/**
 * Bridge funds onto the token's chain without leaving the page (simulated in
 * phase 1). A modal <dialog>: Escape, the close button or a click on the
 * backdrop closes it.
 */
export function BridgeDialog({ open, chain, tokenName, ticker, nativeUsd, onClose, onBridged }: BridgeDialogProps) {
  const { t } = useI18n();
  const b = t.token.bridge;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const sources = sourcesFor(chain);
  const [from, setFrom] = useState<BridgeSource>(sources[0]);
  const info = SOURCES[from];
  const chainName = CHAINS[chain].name;
  const coin = coinOf(chain);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-[440px] rounded-3xl border border-line-strong bg-surface p-0 text-text shadow-menu backdrop:bg-[var(--scrim)] md:mt-[120px]"
    >
      <div className="flex flex-col gap-3.5 p-5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-9 flex-none items-center justify-center rounded-xl bg-neon/14 text-neon">
            <ArrowRightLeft size={18} strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-auto flex-col">
            <h2 id={titleId} className="text-[16px] font-semibold">{fmt(b.title, { chain: chainName })}</h2>
            <span className="text-[12px] text-text-3">{fmt(b.sub, { name: tokenName })}</span>
          </div>
          <IconButton label={b.close} size={32} onClick={onClose} className="rounded-[10px] bg-raised">
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] text-text-3">{b.from}</span>
          <div role="group" aria-label={b.source} className="flex flex-wrap gap-1.5">
            {sources.map((source) => (
              <button
                key={source}
                type="button"
                aria-pressed={from === source}
                onClick={() => setFrom(source)}
                className={cn(
                  "inline-flex h-[34px] items-center gap-1.5 rounded-[17px] border pr-3 pl-1.5 text-[13px]",
                  from === source ? "border-accent/55 bg-accent/14" : "border-line bg-raised",
                )}
              >
                <SourceMark source={source} />
                {SOURCES[source].name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-raised px-4 py-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] text-text-3">{b.send}</span>
            <span className="font-mono text-[24px] leading-[30px] font-semibold max-md:text-[20px]">{sendAmount(from, chain, nativeUsd)}</span>
          </div>
          <ArrowRight size={18} strokeWidth={2} className="flex-none text-text-3" aria-hidden="true" />
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span className="text-[12px] text-text-3">{fmt(b.get, { chain: chainName })}</span>
            <span className="font-mono text-[24px] leading-[30px] font-semibold max-md:text-[20px]">
              {LANDS[chain]} {coin}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2.5 text-[12px] text-text-2">
          <span className="rounded-md bg-accent/14 px-2 py-0.5 font-semibold text-accent-text">{info.provider}</span>
          <span>
            {info.name} → {chainName} · {b.auto}
          </span>
          <span className="flex-auto" />
          <span className="font-mono text-pos">{fmt(b.eta, { seconds: info.eta })}</span>
        </div>
        <button
          type="button"
          onClick={() => onBridged(LANDS[chain], info.provider)}
          className="h-[52px] rounded-[14px] bg-cta text-[16px] font-bold text-on-cta"
        >
          {b.cta}
        </button>
        <span className="text-center text-[12px] text-text-3">{fmt(b.foot, { unit: coin, chain: chainName, ticker })}</span>
      </div>
    </dialog>
  );
}
