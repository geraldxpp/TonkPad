"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { type Dictionary, en } from "./dictionaries/en";
import { type I18n, makeI18n } from "./i18n";

// English until a provider says otherwise, so components also render in isolation (unit tests).
const I18nContext = createContext<I18n>(makeI18n(DEFAULT_LOCALE, en));

interface I18nProviderProps {
  lang: Locale;
  messages: Dictionary;
  children: ReactNode;
}

/** Hands the page's language and messages to Client Components. */
export function I18nProvider({ lang, messages, children }: I18nProviderProps) {
  const value = useMemo(() => makeI18n(lang, messages), [lang, messages]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

/** The current language in Client Components. */
export function useI18n(): I18n {
  return useContext(I18nContext);
}
