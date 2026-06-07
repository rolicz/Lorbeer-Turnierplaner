import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Global edge-agnostic swipe navigation:
 *   swipe right → back, swipe left → forward.
 * Guards against hijacking horizontal scrollers (tables, charts, chip rows,
 * carousels) and range sliders, and respects a `data-no-swipe-nav` opt-out.
 */
const THRESHOLD = 64; // min horizontal travel (px) to trigger
const RATIO = 1.7; // horizontal must dominate vertical by this factor
const MAX_OFF_AXIS = 70; // max vertical drift (px) to still count as horizontal
const MAX_DURATION = 1000; // ms — ignore very slow drags

/** Can `el` still scroll horizontally in the gesture direction? */
function consumesSwipe(el: Element, dir: number): boolean {
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  const ox = getComputedStyle(el).overflowX;
  if (ox !== "auto" && ox !== "scroll") return false;
  // dir > 0 (swipe right → content scrolls to reveal its left): consumable if not at left edge.
  if (dir > 0) return el.scrollLeft > 0;
  // dir < 0 (swipe left → reveal right): consumable if not at right edge.
  return el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
}

function isBlocked(target: EventTarget | null, dir: number): boolean {
  let el: Element | null = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el instanceof HTMLInputElement && el.type === "range") return true;
    if (el.hasAttribute("data-no-swipe-nav")) return true;
    if (consumesSwipe(el, dir)) return true;
    el = el.parentElement;
  }
  return false;
}

export function useSwipeNav(enabled = true) {
  const nav = useNavigate();

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
      const dir = dx > 0 ? 1 : -1;
      if (isBlocked(target, dir)) {
        active = false;
        return;
      }
      fired = true;
      const nowTs = Date.now();
      if (nowTs - lastNavAt < 700) return; // ignore a second nav within the debounce window
      lastNavAt = nowTs;
      if (dir > 0) {
        const idx = Number((window.history.state as { idx?: number } | null)?.idx ?? 0);
        if (idx > 0) nav(-1);
      } else {
        nav(1);
      }
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
