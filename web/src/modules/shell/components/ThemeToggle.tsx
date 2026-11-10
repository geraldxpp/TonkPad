"use client";

import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { IconButton } from "@/shared/ui/IconButton";
import { useTheme } from "../hooks/useTheme";

/**
 * Sun while dark (tap for light), moon while light. Chosen with the `light:`
 * CSS variant so the right icon shows from the first paint.
 */
export function ThemeIcon({ size, strokeWidth = 1.8, className }: { size: number; strokeWidth?: number; className?: string }) {
  return (
    <>
      <Sun size={size} strokeWidth={strokeWidth} aria-hidden="true" className={cn("light:hidden", className)} />
      <Moon size={size} strokeWidth={strokeWidth} aria-hidden="true" className={cn("hidden light:block", className)} />
    </>
  );
}

/** The light/dark switch in the top bar (a 32 px button with a 16 px icon on phones). */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  return (
    <IconButton
      label={theme === "light" ? t.prefs.toDark : t.prefs.toLight}
      size={40}
      onClick={toggleTheme}
      className={cn("md:rounded-lg md:border-transparent md:bg-transparent md:hover:bg-raised", className)}
    >
      <ThemeIcon size={18} className="max-md:size-4" />
    </IconButton>
  );
}
