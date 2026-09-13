export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  } catch {
    return false;
  }
}

function px(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function scrollElementToTop(
  el: HTMLElement,
  opts?: {
    behavior?: ScrollBehavior;
    tolerancePx?: number;
    maxScrollY?: number;
  },
): boolean {
  const tol = opts?.tolerancePx ?? 8;
  const rect = el.getBoundingClientRect();
  const marginTop = px(getComputedStyle(el).scrollMarginTop);

  // We want el's top to sit right below the sticky header (represented by scroll-margin-top).
  const delta = rect.top - marginTop;
  if (Math.abs(delta) <= tol) return false;

  const desired = window.scrollY + delta;
  const top = Math.max(0, opts?.maxScrollY != null ? Math.min(opts.maxScrollY, desired) : desired);

  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : (opts?.behavior ?? "auto");
  window.scrollTo({ top, behavior });
  return true;
}


/**
 * Re-apply attempts after the first one, in ms. Content that arrives late — a
 * lazy route chunk, the ~140ms route-entry skeleton, a query resolving after
 * paint — leaves the document too short for the target offset and the browser
 * silently clamps the scroll.
 */
const RESTORE_RETRIES_MS = [120, 360];

/** How far off the target still counts as "there" (px). */
const RESTORE_TOLERANCE_PX = 4;

/**
 * Put the window back at `top` once the new content has been painted, and keep
 * trying briefly while the page is still too short for it.
 *
 * Always instant: a back navigation that animates its way down the page reads as
 * a glitch (and `prefers-reduced-motion` forbids it outright). A retry only fires
 * while we are still *above* the target, so it can never undo the user's own
 * scrolling or a page's deliberate scroll-into-view.
 *
 * Returns a cancel function — call it when the view changes again.
 */
export function restoreWindowScroll(top: number, onApplied?: (top: number) => void): () => void {
  const apply = () => {
    if (Math.abs(window.scrollY - top) > RESTORE_TOLERANCE_PX) window.scrollTo({ top, left: 0, behavior: "auto" });
    onApplied?.(top);
  };
  const raf = requestAnimationFrame(apply);
  const timers = RESTORE_RETRIES_MS.map((ms) =>
    window.setTimeout(() => {
      if (window.scrollY < top - RESTORE_TOLERANCE_PX) apply();
    }, ms),
  );
  return () => {
    cancelAnimationFrame(raf);
    timers.forEach((t) => window.clearTimeout(t));
  };
}
