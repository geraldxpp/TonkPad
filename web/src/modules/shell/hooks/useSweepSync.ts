"use client";

import { type RefObject, useEffect } from "react";
import { lockToSweep, SYNCED_ANIMATIONS } from "../lib/sweep-clock";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

function isSynced(animation: Animation): boolean {
  return (
    typeof CSSAnimation !== "undefined" &&
    animation instanceof CSSAnimation &&
    SYNCED_ANIMATIONS.has(animation.animationName)
  );
}

/**
 * Pins every sweep-driven CSS animation inside `ref` to the shared sweep clock.
 * Pass a `contentKey` that changes when animated children come and go, so the
 * new ones are pinned too.
 */
export function useSweepSync(ref: RefObject<HTMLElement | null>, contentKey = ""): void {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (reduced || !element || typeof element.getAnimations !== "function") return;
    const animations = element.getAnimations({ subtree: true }).filter(isSynced);
    if (animations.length === 0) return;

    let cancelled = false;
    Promise.all(animations.map((animation) => animation.ready))
      .then(() => {
        if (!cancelled) lockToSweep(animations);
      })
      .catch(() => {
        // An animation was cancelled (e.g. the element unmounted). Nothing to sync.
      });
    return () => {
      cancelled = true;
    };
  }, [ref, reduced, contentKey]);
}
