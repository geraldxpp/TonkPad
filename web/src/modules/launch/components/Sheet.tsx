"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { IconButton } from "@/shared/ui/IconButton";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** The dialog's heading; it also names the dialog. */
  title: string;
  subtitle?: string;
  /** While true the dialog can't be dismissed by its backdrop (something is in flight). */
  busy?: boolean;
  className?: string;
  children: ReactNode;
}

/** A modal dialog: centred on desktop, a bottom sheet on phones. Escape, the close button and the backdrop close it. */
export function Sheet({ open, onClose, title, subtitle, busy = false, className, children }: SheetProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      className={cn(
        "m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[480px] overflow-y-auto rounded-2xl border border-line-strong bg-surface p-0 text-text shadow-menu backdrop:bg-[var(--scrim)] max-md:mb-0 max-md:w-full max-md:max-w-none max-md:rounded-b-none",
        className,
      )}
    >
      <div className="flex flex-col gap-4 p-5 max-md:pb-[calc(20px+env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-display text-[22px] leading-7 font-extrabold tracking-[-0.03em]">{title}</h2>
            {subtitle ? <p className="m-0 text-[12px] text-text-3">{subtitle}</p> : null}
          </div>
          <IconButton label={t.prefs.close} size={32} onClick={onClose} className="flex-none rounded-[10px]">
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
