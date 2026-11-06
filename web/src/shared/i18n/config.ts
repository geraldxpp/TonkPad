/**
 * Supported languages. English is the default and lives at the unprefixed
 * URLs (/, /live, /token/GHOST); every other language is prefixed (/es,
 * /es/live). Right-to-left languages are not supported yet.
 */
export const LOCALES = [
  { code: "en", name: "English", html: "en" },
  { code: "es", name: "Español", html: "es" },
  { code: "pt", name: "Português", html: "pt-BR" },
  { code: "fr", name: "Français", html: "fr" },
  { code: "de", name: "Deutsch", html: "de" },
  { code: "ru", name: "Русский", html: "ru" },
  { code: "tr", name: "Türkçe", html: "tr" },
  { code: "zh", name: "中文", html: "zh-CN" },
  { code: "ja", name: "日本語", html: "ja" },
  { code: "ko", name: "한국어", html: "ko" },
  { code: "vi", name: "Tiếng Việt", html: "vi" },
  { code: "id", name: "Bahasa Indonesia", html: "id" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";

/** Remembers the chosen language; the proxy reads it on unprefixed URLs. */
export const LOCALE_COOKIE = "tonkpad-lang";

export function isLocale(value: string | null | undefined): value is Locale {
  return LOCALES.some((locale) => locale.code === value);
}

export function htmlLang(locale: Locale): string {
  return LOCALES.find((l) => l.code === locale)?.html ?? locale;
}

/** "/token/GHOST" in Spanish → "/es/token/GHOST"; English stays unprefixed. */
export function localizePath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** Splits "/es/live" into { locale: "es", path: "/live" }; unprefixed paths are English. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const first = pathname.split("/")[1];
  if (isLocale(first)) {
    const rest = pathname.slice(first.length + 1);
    return { locale: first, path: rest || "/" };
  }
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/** The same page in another language, keeping the query and hash: ("/es/live?tab=new", "fr") → "/fr/live?tab=new". */
export function switchLocaleUrl(
  locale: Locale,
  location: { pathname: string; search: string; hash: string },
): string {
  const { path } = splitLocale(location.pathname);
  return `${localizePath(locale, path)}${location.search}${location.hash}`;
}

/** The cookie that remembers a language for a year (read by the proxy). */
export function localeCookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function localeName(locale: Locale): string {
  return LOCALES.find((l) => l.code === locale)?.name ?? locale;
}

/** Fills "{name}" placeholders: fmt("Buy {name}", { name: "Ghosty" }). */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
