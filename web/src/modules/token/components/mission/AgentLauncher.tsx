"use client";

import { ArrowUpRight, Bot, X } from "lucide-react";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { IconButton } from "@/shared/ui/IconButton";
import { AgentChat } from "./AgentChat";

/**
 * "Ask Captain Boo": a card that opens the token's agent in a modal dialog (a
 * sheet from the bottom on phones). Escape, the close button or the backdrop
 * close it, and focus returns to the card.
 */
export function AgentLauncher(props: ComponentProps<typeof AgentChat>) {
  const { t } = useI18n();
  const a = t.token.agent;
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left hover:border-line-strong hover:bg-raised/40"
      >
        <span className="inline-flex size-[34px] flex-none items-center justify-center rounded-[9px] bg-agent/10 text-agent">
          <Bot size={17} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-auto flex-col gap-0.5">
          <span className="text-[13px] font-semibold">{fmt(a.ask, { name: props.agent })}</span>
          <span className="text-[11px] text-text-3">{a.askSub}</span>
        </span>
        <ArrowUpRight size={16} strokeWidth={2} className="flex-none text-text-3" aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        aria-label={props.agent}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        className="m-auto w-[calc(100%-32px)] max-w-[440px] overflow-visible bg-transparent p-0 text-text backdrop:bg-[var(--scrim)] max-md:mb-0 max-md:w-full max-md:max-w-none"
      >
        {open ? (
          <div className="flex flex-col gap-2 max-md:[&>section]:rounded-b-none">
            <IconButton label={t.prefs.close} size={32} onClick={() => setOpen(false)} className="self-end rounded-[10px] border border-line bg-surface">
              <X size={15} strokeWidth={2} aria-hidden="true" />
            </IconButton>
            <AgentChat {...props} />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
