"use client";

import { ArrowRight, LoaderCircle, Wallet } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { cn } from "@/shared/lib/cn";

/** What the studio's main button does next. */
export type ActionKind = "fix" | "connect" | "invite" | "offline" | "paused" | "funds" | "review";

export interface ActionState {
  kind: ActionKind;
  label: string;
  disabled: boolean;
}

interface ActionInput {
  /** Errors are showing on the form. */
  hasVisibleErrors: boolean;
  /** The connected Robinhood Chain wallet, if any. */
  owner: string | null;
  /** Whether that wallet may launch here: always, unless the guarded launch's invite list leaves it out. */
  invited: boolean;
  /** Its coin balance in wei, once read. */
  balance: bigint | null;
  payNow: bigint;
  offline: boolean;
  paused: boolean;
  unit: string;
}

/** The button's state, in the order of what is missing: fields to fix, a wallet, an invite, the network, the launchpad, funds. */
export function actionState(t: Dictionary, input: ActionInput): ActionState {
  const a = t.launch.action;
  if (input.hasVisibleErrors) return { kind: "fix", label: a.fix, disabled: false };
  if (!input.owner) return { kind: "connect", label: t.header.connectWallet, disabled: false };
  if (!input.invited) return { kind: "invite", label: a.inviteOnly, disabled: true };
  if (input.offline) return { kind: "offline", label: a.unavailable, disabled: true };
  if (input.paused) return { kind: "paused", label: a.paused, disabled: true };
  if (input.balance !== null && input.balance < input.payNow) return { kind: "funds", label: fmt(a.noFunds, { unit: input.unit }), disabled: true };
  return { kind: "review", label: a.review, disabled: false };
}

interface LaunchActionProps {
  state: ActionState;
  /** The wallet picker is opening. */
  busy?: boolean;
  onClick: () => void;
  className?: string;
}

/** The studio's main button. A disabled state stays focusable and says why. */
export function LaunchAction({ state, busy = false, onClick, className }: LaunchActionProps) {
  const off = state.disabled || busy;
  const Icon = state.kind === "connect" ? Wallet : ArrowRight;
  return (
    <button
      type="button"
      aria-disabled={off || undefined}
      onClick={off ? undefined : onClick}
      className={cn(
        "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold",
        off ? "cursor-not-allowed border border-line-strong bg-input text-text-2" : "bg-cta text-on-cta shadow-cta hover:brightness-110",
        className,
      )}
    >
      {state.label}
      {busy ? <LoaderCircle size={16} strokeWidth={2} className="tk-spin" aria-hidden="true" /> : off ? null : <Icon size={16} strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}
