"use client";

import { ArrowRight, ArrowRightLeft } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";

/** "Need funds on Robinhood Chain?": opens the bridge dialog. The export's lime is the brand green here. */
export function BridgeBanner({ chainName, onOpen }: { chainName: string; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/6 px-3.5 py-2.5 text-left hover:bg-accent/10"
    >
      <span className="inline-flex size-8 flex-none items-center justify-center rounded-lg bg-accent/12 text-accent-text">
        <ArrowRightLeft size={18} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="flex flex-auto flex-col gap-0.5">
        <span className="text-[12px] font-semibold">{fmt(t.token.trade.bridgeTitle, { chain: chainName })}</span>
        <span className="text-[11px] text-text-2">{t.token.trade.bridgeBody}</span>
      </span>
      <ArrowRight size={16} strokeWidth={2} className="flex-none text-accent-text" aria-hidden="true" />
    </button>
  );
}
