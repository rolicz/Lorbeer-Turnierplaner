import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { backActionFor } from "./backNavigation";

/**
 * Global swipe navigation: **swipe right → back. That is the whole gesture.**
 *
 * It is not "like" the back chevron, it *is* the back chevron: both call
 * `backActionFor`, so a swipe and a tap can never land in different places. On a
 * page you went into it goes one level up (popping when the entry behind already
 * is that parent); on a destination it is the history step behind you, or home
 * when there is none.
 *
 * **There is no forward gesture** (Q6). Nothing in the OS this app imitates has
 * one — iOS has none inside an app, Android has none, and a standalone PWA has no
 * browser chrome to borrow one from — and an invisible gesture that is available
 * a minority of the time is not a feature, it is a way for an ordinary left drag
 * to navigate by surprise. A left swipe now does nothing at all.
 *
 * Guards against hijacking horizontal scrollers (tables, charts, chip rows,
 * carousels) and range sliders, and respects a `data-no-swipe-nav` opt-out.
 * The listeners are `passive`, so the iOS system edge-swipe is never fought.
 */
const THRESHOLD = 64; // min horizontal travel (px) to trigger
const RATIO = 1.7; // horizontal must dominate vertical by this factor
const MAX_OFF_AXIS = 70; // max vertical drift (px) to still count as horizontal
const MAX_DURATION = 1000; // ms — ignore very slow drags

/**
 * Can `el` still scroll right-wards under the gesture? A swipe right reveals the
 * content to its left, so the element consumes it while it is not at its left edge.
 */
function consumesSwipe(el: Element): boolean {
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  const ox = getComputedStyle(el).overflowX;
  if (ox !== "auto" && ox !== "scroll") return false;
  return el.scrollLeft > 0;
}

function isBlocked(target: EventTarget | null): boolean {
  let el: Element | null = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el instanceof HTMLInputElement && el.type === "range") return true;
    if (el.hasAttribute("data-no-swipe-nav")) return true;
    if (consumesSwipe(el)) return true;
    el = el.parentElement;
  }
  return false;
}

export function useSwipeNav(enabled = true) {
  const nav = useNavigate();
  const loc = useLocation();
  // The listeners are registered once; they read the current route through this
  // ref instead of re-binding on every navigation.
  const locRef = useRef(loc);
  useEffect(() => {
    locRef.current = loc;
  }, [loc]);

  useEffect(() => {
    if (!enabled) return;

    let sx = 0;
    let sy = 0;
    let st = 0;
    let active = false;
    let fired = false;
    let target: EventTarget | null = null;
    let lastNavAt = 0; // debounce so a gesture can't double-trigger (e.g. with native edge-swipe)

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        active = false;
        return;
      }
      const t = e.touches[0];
      sx = t.clientX;
      sy = t.clientY;
      st = Date.now();
      target = e.target;
      active = true;
      fired = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!active || fired || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) < THRESHOLD) return;
      if (Math.abs(dx) < Math.abs(dy) * RATIO || Math.abs(dy) > MAX_OFF_AXIS) {
        active = false;
        return;
      }
      if (Date.now() - st > MAX_DURATION) {
        active = false;
        return;
      }
      // Left is not a gesture any more; let the drag end without navigating.
      if (dx < 0) {
        active = false;
        return;
      }
      if (isBlocked(target)) {
        active = false;
        return;
      }
      fired = true;
      const loc = locRef.current;
      const action = backActionFor(loc.pathname, loc.search, loc.state as unknown);
      // Nothing to do — and nothing was spent: the next swipe is not debounced.
      if (action.kind === "none") return;
      const nowTs = Date.now();
      if (nowTs - lastNavAt < 700) return; // ignore a second nav within the debounce window
      lastNavAt = nowTs;
      if (action.kind === "pop") nav(-1);
      else nav(action.to, { replace: true });
    };

    const onEnd = () => {
      active = false;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, nav]);
}
