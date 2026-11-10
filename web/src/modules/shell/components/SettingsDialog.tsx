"use client";

import { Moon, Sun, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { IconButton } from "@/shared/ui/IconButton";
import { Segmented, type SegmentedOption } from "@/shared/ui/Segmented";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../lib/theme";
import { LanguageLinks } from "./LanguageLinks";
import { WalletPanel } from "./WalletPanel";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const HEADING = "m-0 text-[12px] font-semibold tracking-[0.04em] text-text-3 uppercase";

/**
 * Wallet, theme and language, opened from More. A modal <dialog>: a bottom sheet on
 * phones, a panel beside the rail on desktop. Escape, the close button or a
 * click on the backdrop closes it, and focus returns to More.
 */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const titleId = useId();
  const walletId = useId();
  const themeId = useId();
  const languageId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const themes: readonly SegmentedOption<Theme>[] = [
    { id: "dark", label: t.prefs.dark, icon: <Moon size={14} strokeWidth={2} aria-hidden="true" /> },
    { id: "light", label: t.prefs.light, icon: <Sun size={14} strokeWidth={2} aria-hidden="true" /> },
  ];

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-0 max-h-[min(640px,calc(100dvh_-_32px))] w-[340px] max-w-none overflow-y-auto overscroll-contain rounded-[18px] border border-line-strong bg-raised p-0 text-text shadow-menu backdrop:bg-[var(--scrim)] md:top-auto md:bottom-4 md:left-[88px] max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:max-h-[85dvh] max-md:w-full max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0"
    >
      <div className="flex flex-col gap-5 p-5 max-md:pb-[calc(20px+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="m-0 font-display text-[20px] leading-6 font-bold tracking-[-0.01em]">
            {t.prefs.title}
          </h2>
          <IconButton label={t.prefs.close} onClick={onClose}>
            <X size={18} strokeWidth={1.8} />
          </IconButton>
        </div>
        <section aria-labelledby={walletId} className="flex flex-col gap-2.5">
          <h3 id={walletId} className={HEADING}>
            {t.wallet.title}
          </h3>
          <div className="rounded-[14px] border border-line bg-surface p-1.5">
            {open ? <WalletPanel onClose={onClose} /> : null}
          </div>
        </section>
        <section aria-labelledby={themeId} className="flex flex-col gap-2.5">
          <h3 id={themeId} className={HEADING}>
            {t.prefs.theme}
          </h3>
          <Segmented label={t.prefs.theme} options={themes} value={theme} onChange={setTheme} fill />
        </section>
        <section aria-labelledby={languageId} className="flex flex-col gap-2.5">
          <h3 id={languageId} className={HEADING}>
            {t.prefs.language}
          </h3>
          {open ? <LanguageLinks onStay={onClose} /> : null}
        </section>
      </div>
    </dialog>
  );
}
