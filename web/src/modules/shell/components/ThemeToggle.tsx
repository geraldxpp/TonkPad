"use client";

import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { IconButton } from "@/shared/ui/IconButton";
import { useTheme } from "../hooks/useTheme";

/**
 * Sun while dark (tap for light), moon while light. Chosen with the `light:`
 * CSS variant so the right icon shows from the first paint.
 */
export function ThemeIcon({ size, strokeWidth = 1.8 }: { size: number; strokeWidth?: number }) {
  return (
    <>
      <Sun size={size} strokeWidth={strokeWidth} aria-hidden="true" className="light:hidden" />
      <Moon size={size} strokeWidth={strokeWidth} aria-hidden="true" className="hidden light:block" />
    </>
  );
}

/** The light/dark switch in the desktop top bar. */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  return (
    <IconButton
      label={theme === "light" ? t.prefs.toDark : t.prefs.toLight}
      size={40}
      onClick={toggleTheme}
      className={className}
    >
      <ThemeIcon size={18} />
    </IconButton>
  );
}
