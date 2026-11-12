/**
 * This browser's watchlist: token addresses starred on their token pages
 * (localStorage, under the key returning visitors already have). Alerts read
 * it for "a token I watch" switches; tabs stay in step through the storage event.
 */
export const WATCHLIST_KEY = "tonkpad-watchlist";
export const WATCHLIST_CHANGED = "tonkpad-watchlist-change";

export function readWatchlist(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(WATCHLIST_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function writeWatchlist(list: readonly string[]): void {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  } catch {
    return; // Storage blocked (private mode): nothing to remember it in.
  }
  window.dispatchEvent(new Event(WATCHLIST_CHANGED));
}

export function subscribeWatchlist(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(WATCHLIST_CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(WATCHLIST_CHANGED, onChange);
  };
}
