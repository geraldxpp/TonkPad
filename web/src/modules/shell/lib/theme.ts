/**
 * Dark is the default theme; light is opt-in and remembered in localStorage.
 * The theme lives on <html data-theme>, which tokens.css keys its palettes on.
 */
export type Theme = "dark" | "light";

export const DEFAULT_THEME: Theme = "dark";
export const THEME_STORAGE_KEY = "tonkpad-theme";
/** Fired on window whenever the theme changes, so every toggle stays in step. */
export const THEME_EVENT = "tonkpad:theme";

/** Browser chrome colour (<meta name="theme-color">) per theme: the page background. */
export const THEME_COLORS: Record<Theme, string> = { dark: "#07080A", light: "#F3F5F8" };

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

/**
 * Runs in <head> before the first paint. The server always renders the dark
 * theme; this switches to light before anything shows if that was the saved
 * choice, so a light page never flashes dark.
 */
export const THEME_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})!=="light")return;document.documentElement.setAttribute("data-theme","light");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",${JSON.stringify(THEME_COLORS.light)})}catch(e){}})()`;

/** The theme currently on the page. */
export function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/** Puts a theme on the page (without saving it) and tells every listener. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Applies a theme and remembers it for the next visit. */
export function saveTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies to this page.
  }
}
