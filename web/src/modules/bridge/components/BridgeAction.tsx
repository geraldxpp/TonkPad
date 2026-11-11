"use client";

import { ArrowRight, LoaderCircle, Wallet } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { ActionState } from "../lib/view";

interface BridgeActionProps {
  state: ActionState;
  connecting: boolean;
  compact?: boolean;
  onConnect: () => void;
  onReview: () => void;
}

/** The main button: Connect, a reason it can't go yet, or Review bridge. */
export function BridgeAction({ state, connecting, compact = false, onConnect, onReview }: BridgeActionProps) {
  const { t } = useI18n();
  const wantsWallet = state.kind === "connect" || state.kind === "connect-to";
  const live = wantsWallet || state.kind === "review";
  return (
    <button
      type="button"
      aria-disabled={!live || undefined}
      aria-busy={connecting || state.kind === "wait" || undefined}
      onClick={() => {
        if (wantsWallet) onConnect();
        if (state.kind === "review") onReview();
      }}
      className={cn("inline-flex items-center justify-between gap-3 rounded-lg px-4 text-left font-semibold", compact ? "h-[46px] min-w-[157px] flex-none text-[12px]" : "h-12 w-full text-[13px]", live ? "bg-cta text-on-cta hover:brightness-110" : "cursor-not-allowed border border-line-strong bg-input text-text-2")}
    >
      <span className="truncate">{connecting ? t.wallet.connecting : state.label}</span>
      {connecting || state.kind === "wait" ? <LoaderCircle size={16} strokeWidth={2} className="tk-spin flex-none" aria-hidden="true" /> : wantsWallet ? <Wallet size={16} strokeWidth={2} className="flex-none" aria-hidden="true" /> : <ArrowRight size={16} strokeWidth={2} className="flex-none" aria-hidden="true" />}
    </button>
  );
}
