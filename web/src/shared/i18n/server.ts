import { lang } from "next/root-params";
import { DEFAULT_LOCALE, isLocale } from "./config";
import { DICTIONARIES } from "./dictionaries";
import { type I18n, makeI18n } from "./i18n";

/**
 * The current language in Server Components, read from the `[lang]` root
 * segment. It is known at build time, so pages stay statically prerendered.
 */
export async function getI18n(): Promise<I18n> {
  const value = await lang();
  const locale = isLocale(value) ? value : DEFAULT_LOCALE;
  return makeI18n(locale, DICTIONARIES[locale]);
}
