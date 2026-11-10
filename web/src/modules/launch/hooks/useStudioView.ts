"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

const PHONE = "(max-width: 767px)";

const subscribe = (listener: () => void) => {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};

/** True below the `md` breakpoint, where the studio is a four-step flow. The server render assumes a wide screen. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false);
}

const subscribeScroll = (listener: () => void) => {
  window.addEventListener("scroll", listener, { passive: true });
  window.addEventListener("resize", listener);
  return () => {
    window.removeEventListener("scroll", listener);
    window.removeEventListener("resize", listener);
  };
};

/** The card being read: the last one whose top has passed the upper third of the viewport; the fourth at the page's end. */
function stepInView(): number {
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2 && window.scrollY > 0) return 4;
  const line = window.innerHeight * 0.3;
  let step = 1;
  for (const number of [2, 3, 4]) {
    const top = document.getElementById(`step-${number}`)?.getBoundingClientRect().top;
    if (top !== undefined && top <= line) step = number;
  }
  return step;
}

/** The step whose card is in view on a wide screen, for the step bar's highlight. */
export function useStepInView(): number {
  return useSyncExternalStore(subscribeScroll, stepInView, () => 1);
}

/** The step bar's id: where a phone lands when the step changes. */
export const STEPS_ID = "launch-steps";

/**
 * Phones, once a new step is on screen: focus the field that was asked for,
 * or bring the step bar to the top. Returns the function that asks; call it
 * just before changing the step.
 */
export function useAfterStep(step: number): (focusId?: string) => void {
  const todo = useRef<string | null>(null);
  useEffect(() => {
    const target = todo.current;
    todo.current = null;
    if (target === null) return;
    const field = target ? document.getElementById(target) : null;
    if (field) field.focus();
    else document.getElementById(STEPS_ID)?.scrollIntoView({ block: "start" });
  }, [step]);
  return useCallback((focusId = "") => {
    todo.current = focusId;
  }, []);
}

/** Scrolls to an element, smoothly unless the visitor asked for reduced motion. */
export function scrollToId(id: string) {
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
}
