"use client";

import { ArrowUpRight, Check, LoaderCircle } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { explorerTxUrl, type TonkNetwork } from "@/shared/tonk/networks";
import { type ActionState, isWorking } from "../../hooks/useAction";
import { runError } from "../../lib/curve-text";

interface ActionNoteProps {
  state: ActionState;
  network: TonkNetwork;
  /** What to say once the receipt confirms it, from its own events. */
  done: string;
}

/**
 * Where a claim, an extension, an edit or a withdrawal stands: checking,
 * waiting on the wallet, confirming, then done or why not. Nothing is called
 * done before its receipt.
 */
export function ActionNote({ state, network, done }: ActionNoteProps) {
  const { t } = useI18n();
  const m = t.mission;
  if (state.step === "idle") return null;
  const working = isWorking(state);
  const text = state.step === "preparing" ? m.trade.preparing : state.step === "sign" ? m.trade.sign : state.step === "confirming" ? m.action.confirming : state.step === "done" ? done : runError(t, state.error, network.unit);
  return (
    <div role={state.step === "failed" ? "alert" : "status"} aria-live="polite" className="flex flex-col gap-1.5 rounded-lg border border-line bg-raised px-3 py-2.5">
      <p className={`m-0 flex items-start gap-2 text-[12px] leading-[1.6] ${state.step === "failed" ? "text-neg" : "text-text-2"}`}>
        {working ? <LoaderCircle size={14} strokeWidth={2} className="tk-spin mt-0.5 flex-none text-accent-text" aria-hidden="true" /> : null}
        {state.step === "done" ? <Check size={14} strokeWidth={2.6} className="mt-0.5 flex-none text-pos" aria-hidden="true" /> : null}
        <span className="[overflow-wrap:anywhere]">
          {state.step === "failed" ? <strong className="block font-semibold">{m.trade.failedTitle}</strong> : null}
          {text}
        </span>
      </p>
      {state.hash ? (
        <a href={explorerTxUrl(network, state.hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-start rounded text-[12px] font-semibold text-accent-text">
          {t.swap.viewTx}
          <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}
