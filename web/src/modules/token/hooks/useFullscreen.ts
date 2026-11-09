"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Full screen for one element. Browsers without the Fullscreen API for
 * elements (iPhone Safari) get a fixed overlay instead, closed with Escape
 * or the same button.
 */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [native, setNative] = useState(false);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    const onChange = () => setNative(ref.current !== null && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverlay(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overlay]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (overlay) {
      setOverlay(false);
    } else if (document.fullscreenEnabled && typeof el.requestFullscreen === "function") {
      el.requestFullscreen().catch(() => setOverlay(true));
    } else {
      setOverlay(true);
    }
  }, [overlay]);

  return { ref, full: native || overlay, overlay, toggle };
}
