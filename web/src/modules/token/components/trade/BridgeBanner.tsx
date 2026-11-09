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
      className="flex items-center gap-3 rounded-2xl border border-neon/32 bg-[linear-gradient(90deg,rgb(var(--neon-rgb)/0.1),rgb(var(--accent-rgb)/0.14))] px-3.5 py-3 text-left"
    >
      <span className="inline-flex size-9 flex-none items-center justify-center rounded-xl bg-neon/14 text-neon">
        <ArrowRightLeft size={18} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="flex flex-auto flex-col gap-0.5">
        <span className="text-[13px] font-semibold">{fmt(t.token.trade.bridgeTitle, { chain: chainName })}</span>
        <span className="text-[12px] text-text-2">{t.token.trade.bridgeBody}</span>
      </span>
      <ArrowRight size={18} strokeWidth={2} className="flex-none text-neon" aria-hidden="true" />
    </button>
  );
}
