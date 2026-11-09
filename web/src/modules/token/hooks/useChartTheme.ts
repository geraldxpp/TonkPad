"use client";

import { useMemo, useSyncExternalStore } from "react";

/** The theme tokens the canvas chart draws with; a canvas can't read CSS variables itself. */
export interface ChartTheme {
  text3: string;
  line: string;
  lineStrong: string;
  raised: string;
  pos: string;
  neg: string;
  gold: string;
  mono: string;
}

function readTheme(): ChartTheme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    text3: v("--text-3", "#7D838C"),
    line: v("--line", "#1D2127"),
    lineStrong: v("--line-strong", "#2C3139"),
    raised: v("--raised", "#15181C"),
    pos: v("--pos", "#3DDC84"),
    neg: v("--neg", "#FF5C74"),
    gold: v("--gold", "#F4C553"),
    mono: v("--font-mono", "ui-monospace, monospace"),
  };
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const themeName = () => document.documentElement.getAttribute("data-theme") ?? "dark";

/** The current theme's chart colours, re-read whenever the theme switches. Null on the server and while hydrating. */
export function useChartTheme(): ChartTheme | null {
  const name = useSyncExternalStore(subscribe, themeName, () => null);
  return useMemo(() => (name === null ? null : readTheme()), [name]);
}
