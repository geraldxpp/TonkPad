"use client";

import { Gift } from "lucide-react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CHAINS } from "@/shared/config/chains";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { ChainMark } from "@/shared/ui/ChainMark";

/** The top bar's slot for a page's own controls (see TopBar). */
export const TOPBAR_SLOT = "tk-topbar-slot";

const noop = () => () => undefined;

/** The launch chain, as a static pill. */
export function ChainPill() {
  return (
    <span className="inline-flex flex-none items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-[12px] whitespace-nowrap text-text-2">
      <ChainMark chain="rh" size={16} decorative />
      {CHAINS.rh.name}
      <span className="font-mono text-[11px] text-text-3">(ETH)</span>
    </span>
  );
}

export function ReferButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-9 flex-none items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium whitespace-nowrap text-gold hover:bg-raised">
      <Gift size={14} strokeWidth={2} aria-hidden="true" />
      {t.launch.referCta}
    </button>
  );
}

/** Desktop: the Robinhood Chain pill and Refer & earn, shown in the shared top bar while the studio is open. */
export function TopBarActions({ onRefer }: { onRefer: () => void }) {
  const slot = useSyncExternalStore(noop, () => document.getElementById(TOPBAR_SLOT), () => null);
  if (!slot) return null;
  return createPortal(
    <div className="flex flex-none items-center gap-1.5 max-lg:hidden">
      <ChainPill />
      <ReferButton onClick={onRefer} />
    </div>,
    slot,
  );
}
