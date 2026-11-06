"use client";

import { Check } from "lucide-react";
import type { KeyboardEvent } from "react";
import { localeCookie, LOCALES, switchLocaleUrl } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";

interface LanguageLinksProps {
  /** Called when the current language is picked again (nothing to load). */
  onStay?: () => void;
}

// Rendered only after the menu opens, so the browser URL is always available.
function currentLocation() {
  return window.location;
}

/** Arrow keys, Home and End move between the language links. */
function moveFocus(event: KeyboardEvent<HTMLUListElement>) {
  const links = Array.from(event.currentTarget.querySelectorAll("a"));
  const index = links.indexOf(document.activeElement as HTMLAnchorElement);
  const last = links.length - 1;
  const next =
    event.key === "ArrowDown" || event.key === "ArrowRight" ? (index >= last ? 0 : index + 1)
    : event.key === "ArrowUp" || event.key === "ArrowLeft" ? (index <= 0 ? last : index - 1)
    : event.key === "Home" ? 0
    : event.key === "End" ? last
    : null;
  if (next === null) return;
  event.preventDefault();
  links[next]?.focus();
}

/**
 * The twelve languages, each a link to this page in that language (query and
 * hash kept). Following one remembers the choice in the tonkpad-lang cookie.
 * Names are written in their own language and marked with `lang`.
 */
export function LanguageLinks({ onStay }: LanguageLinksProps) {
  const { lang } = useI18n();
  const location = currentLocation();
  return (
    <ul className="grid grid-cols-2 gap-0.5" onKeyDown={moveFocus}>
      {LOCALES.map((locale) => {
        const current = locale.code === lang;
        return (
          <li key={locale.code} className="flex">
            <a
              href={switchLocaleUrl(locale.code, location)}
              hrefLang={locale.html}
              lang={locale.html}
              aria-current={current ? "true" : undefined}
              data-locale={locale.code}
              onClick={(event) => {
                // Opening a language in a new tab doesn't change this tab's choice.
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                if (current) {
                  event.preventDefault();
                  onStay?.();
                  return;
                }
                document.cookie = localeCookie(locale.code);
              }}
              className={cn(
                "flex min-w-0 flex-auto items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] font-medium",
                current ? "bg-accent/14 text-text" : "text-text-2 hover:bg-input hover:text-text",
              )}
            >
              <span className="min-w-0 flex-auto truncate">{locale.name}</span>
              {current ? <Check size={14} strokeWidth={2.4} aria-hidden="true" className="flex-none text-accent-text" /> : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
