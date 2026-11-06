import { type Locale, localizePath } from "./config";
import type { Dictionary } from "./dictionaries/en";

/** What components read: the language, its messages and a link helper. */
export interface I18n {
  lang: Locale;
  t: Dictionary;
  /** Adds the language prefix to an app path ("/live" → "/es/live"; English stays "/live"). */
  href: (path: string) => string;
}

export function makeI18n(lang: Locale, t: Dictionary): I18n {
  return { lang, t, href: (path) => localizePath(lang, path) };
}
