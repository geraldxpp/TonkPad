import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, readTheme, saveTheme, THEME_COLORS, THEME_EVENT, THEME_SCRIPT, THEME_STORAGE_KEY } from "../lib/theme";

function resetPage() {
  document.documentElement.setAttribute("data-theme", "dark");
  document.head.innerHTML = `<meta name="theme-color" content="${THEME_COLORS.dark}">`;
  localStorage.clear();
}

/** Runs the inline <head> script the way the browser would. */
function runThemeScript() {
  new Function(THEME_SCRIPT)();
}

describe("theme", () => {
  afterEach(resetPage);

  it("defaults to dark", () => {
    resetPage();
    expect(readTheme()).toBe("dark");
  });

  it("applies and remembers a theme, and tells listeners", () => {
    resetPage();
    const listener = vi.fn();
    window.addEventListener(THEME_EVENT, listener);
    saveTheme("light");
    window.removeEventListener(THEME_EVENT, listener);

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(THEME_COLORS.light);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("applyTheme changes the page without saving", () => {
    resetPage();
    applyTheme("light");
    expect(readTheme()).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("the head script restores a saved light theme before paint", () => {
    resetPage();
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    runThemeScript();
    expect(readTheme()).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(THEME_COLORS.light);
  });

  it("the head script leaves dark alone and ignores junk", () => {
    resetPage();
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    runThemeScript();
    expect(readTheme()).toBe("dark");
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    runThemeScript();
    expect(readTheme()).toBe("dark");
  });
});
