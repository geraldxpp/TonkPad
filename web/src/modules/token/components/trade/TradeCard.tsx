"use client";

import { SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { IconButton } from "@/shared/ui/IconButton";

interface TradeCardProps {
  name: string;
  /** In the phone sheet: a close button takes the settings mark's place. */
  onClose?: () => void;
  children: ReactNode;
}

/** The trade form's card: "Trade {name}" with the settings mark, then the form. */
export function TradeCard({ name, onClose, children }: TradeCardProps) {
  const { t } = useI18n();
  const tr = t.token.trade;
  return (
    <section aria-label={tr.label} className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5 max-md:p-4">
      {onClose ? <span aria-hidden="true" className="mx-auto -mt-1.5 h-1 w-9 rounded-full bg-line-strong" /> : null}
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate font-display text-[18px] leading-6 font-bold tracking-[-0.02em]">{fmt(tr.title, { name })}</h2>
        {onClose ? (
          <IconButton label={t.prefs.close} size={32} onClick={onClose} className="rounded-[10px]">
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        ) : (
          <SlidersHorizontal size={16} strokeWidth={1.8} className="flex-none text-text-3" role="img" aria-label={tr.settings} />
        )}
      </div>
      {children}
    </section>
  );
}
