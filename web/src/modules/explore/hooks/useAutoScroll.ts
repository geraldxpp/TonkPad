"use client";

import { type RefObject, useCallback, useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/modules/shell/hooks/usePrefersReducedMotion";

/** Glide speed in px per second. */
const SPEED = 36;
const RESUME_AFTER_TOUCH_MS = 3000;
const RESUME_AFTER_WHEEL_MS = 2000;
const RESUME_AFTER_STEP_MS = 5000;

/** One full loop: from the first copy of the items to the second. 0 when the copies are hidden. */
function loopWidth(track: HTMLElement): number {
  const first = track.children[0] as HTMLElement | undefined;
  const second = track.children[1] as HTMLElement | undefined;
  if (!first || !second || second.offsetParent === null) return 0;
  return second.offsetLeft - first.offsetLeft;
}

/**
 * Glides a horizontal scroller on its own. The track holds its items several
 * times over, and once the first copy has passed the position wraps back by
 * one copy, so the loop is seamless. It is still a normal scroller: hover,
 * keyboard focus, touch and the wheel pause it, and `step` moves one item.
 * Off screen, in a background tab or with reduced motion it stays still.
 */
export function useAutoScroll(scrollerRef: RefObject<HTMLElement | null>, trackRef: RefObject<HTMLElement | null>) {
  const reduced = usePrefersReducedMotion();
  const holdUntil = useRef(0);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track || reduced) return;

    let frame = 0;
    let last = performance.now();
    let pos = scroller.scrollLeft;
    let written = pos;
    let hovering = false;
    let focused = false;
    let visible = true;

    const hold = (ms: number) => {
      holdUntil.current = Math.max(holdUntil.current, performance.now() + ms);
    };
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === "mouse") hovering = true;
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") hovering = false;
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") hold(RESUME_AFTER_TOUCH_MS);
    };
    const onWheel = () => hold(RESUME_AFTER_WHEEL_MS);
    const onFocusIn = () => {
      focused = true;
    };
    const onFocusOut = (e: FocusEvent) => {
      focused = e.relatedTarget instanceof Node && scroller.contains(e.relatedTarget);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });

    scroller.addEventListener("pointerenter", onEnter);
    scroller.addEventListener("pointerleave", onLeave);
    scroller.addEventListener("pointerdown", onDown);
    scroller.addEventListener("wheel", onWheel, { passive: true });
    scroller.addEventListener("focusin", onFocusIn);
    scroller.addEventListener("focusout", onFocusOut);
    observer.observe(scroller);

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      // Someone else moved it (a swipe, the wheel, a step): carry on from there.
      if (Math.abs(scroller.scrollLeft - written) > 1) pos = scroller.scrollLeft;
      if (visible && !hovering && !focused && now >= holdUntil.current) {
        pos += (SPEED * dt) / 1000;
        const loop = loopWidth(track);
        if (loop > 0 && pos >= loop) pos -= loop;
        scroller.scrollLeft = pos;
      }
      written = scroller.scrollLeft;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener("pointerenter", onEnter);
      scroller.removeEventListener("pointerleave", onLeave);
      scroller.removeEventListener("pointerdown", onDown);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("focusin", onFocusIn);
      scroller.removeEventListener("focusout", onFocusOut);
    };
  }, [scrollerRef, trackRef, reduced]);

  /** Moves one item back or forward, wrapping through the copies, and pauses the glide a moment. */
  const step = useCallback(
    (direction: 1 | -1) => {
      const scroller = scrollerRef.current;
      const track = trackRef.current;
      if (!scroller || !track) return;
      holdUntil.current = performance.now() + RESUME_AFTER_STEP_MS;
      const firstCopy = track.children[0] as HTMLElement | undefined;
      const item = firstCopy?.firstElementChild as HTMLElement | null | undefined;
      const gap = firstCopy ? parseFloat(getComputedStyle(firstCopy).columnGap) || 0 : 0;
      const delta = (item?.offsetWidth ?? 240) + gap;
      const loop = loopWidth(track);
      let target = scroller.scrollLeft + direction * delta;
      if (loop > 0 && target < 0) {
        scroller.scrollLeft += loop;
        target += loop;
      } else if (loop > 0 && target > loop * 2) {
        scroller.scrollLeft -= loop;
        target -= loop;
      }
      scroller.scrollTo({ left: target, behavior: reduced ? "auto" : "smooth" });
    },
    [scrollerRef, trackRef, reduced],
  );

  return { step };
}
