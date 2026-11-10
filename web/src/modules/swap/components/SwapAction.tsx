"use client";

import { ArrowRight, LoaderCircle, Wallet } from "lucide-react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { ChainId } from "@/shared/types/chain";
import type { SwapQuote, SwapToken } from "@/shared/types/swap";

/** What the swap button can do right now, and what it says. */
export interface ActionState {
  kind: "connect" | "review" | "wait" | "blocked";
  label: string;
}

interface ActionInputs {
  chain: ChainId;
  /** The wallet connected on this chain, and whether any wallet is connected at all. */
  owner: string | null;
  anyWallet: boolean;
  from: SwapToken | null;
  raw: string | null;
  /** The pay token's balance in base units, when known. */
  balance: string | null;
  quote: SwapQuote | null;
  loading: boolean;
  error: string | null;
}

/** The button's state, in order: a wallet, an amount, enough funds, a quote, the go-live switch, then Review. */
export function actionState(s: Dictionary["swap"], input: ActionInputs): ActionState {
  const chainName = CHAINS[input.chain].name;
  if (!input.owner) return { kind: "connect", label: input.anyWallet ? fmt(s.connectOn, { chain: chainName }) : s.connect };
  if (!input.from || !input.raw) return { kind: "blocked", label: s.enterAmount };
  if (input.balance !== null && BigInt(input.raw) > BigInt(input.balance)) return { kind: "blocked", label: fmt(s.short, { symbol: input.from.symbol }) };
  if (input.error === "no-route") return { kind: "blocked", label: s.noRoute };
  if (input.error && !input.quote) return { kind: "blocked", label: input.error === "busy" ? s.busy : s.unavailable };
  if (!input.quote) return { kind: "wait", label: s.quoting };
  if (!input.quote.tradingOpen) return { kind: "blocked", label: s.closed };
  return { kind: "review", label: s.review };
}

interface SwapActionProps {
  state: ActionState;
  onConnect: () => void;
  onReview: () => void;
  connecting: boolean;
  compact?: boolean;
}

/** The swap's main button: Connect, a reason it can't go yet, or Review swap. */
export function SwapAction({ state, onConnect, onReview, connecting, compact = false }: SwapActionProps) {
  const { t } = useI18n();
  const live = state.kind === "connect" || state.kind === "review";
  return (
    <button
      type="button"
      aria-disabled={!live || undefined}
      aria-busy={connecting || state.kind === "wait" || undefined}
      onClick={() => {
        if (state.kind === "connect") onConnect();
        if (state.kind === "review") onReview();
      }}
      className={cn(
        "inline-flex items-center justify-between gap-3 rounded-lg px-4 text-left font-semibold",
        compact ? "h-11 text-[13px]" : "h-12 w-full text-[14px]",
        live ? "bg-cta text-on-cta hover:brightness-110" : "cursor-not-allowed border border-line-strong bg-input text-text-2",
      )}
    >
      <span className="truncate">{connecting ? t.wallet.connecting : state.label}</span>
      {connecting || state.kind === "wait" ? (
        <LoaderCircle size={16} strokeWidth={2} className="tk-spin flex-none" aria-hidden="true" />
      ) : state.kind === "connect" ? (
        <Wallet size={16} strokeWidth={2} className="flex-none" aria-hidden="true" />
      ) : (
        <ArrowRight size={16} strokeWidth={2} className="flex-none" aria-hidden="true" />
      )}
    </button>
  );
}
