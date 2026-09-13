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
 * How long to keep trying to reach a restored offset, and how often. Content
 * arrives late — a lazy route chunk, the ~140ms route-entry skeleton, a query
 * that only resolves after paint — and until it does, the document is too short
 * for the offset and the browser silently clamps the scroll.
 */
const RESTORE_DEADLINE_MS = 1500;
const RESTORE_STEP_MS = 80;

/** How far off the target still counts as "there" (px). */
const RESTORE_TOLERANCE_PX = 4;

/**
 * Put the window back at `top` once the new content has been painted, and keep
 * trying (briefly) while the page is still too short to allow it.
 *
 * Always instant: a back navigation that animates its way down the page reads as
 * a glitch (and `prefers-reduced-motion` forbids it outright). The loop stops the
 * moment the offset is reached, when the user touches the page (wheel, touch or
 * key — their scrolling always wins), or at the deadline.
 *
 * Returns a cancel function — call it when the view changes again.
 */
export function restoreWindowScroll(top: number, onApplied?: (top: number) => void): () => void {
  let timer = 0;
  let raf = 0;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) window.clearTimeout(timer);
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stop);
  };

  const apply = () => {
    if (Math.abs(window.scrollY - top) > RESTORE_TOLERANCE_PX) window.scrollTo({ top, left: 0, behavior: "auto" });
    onApplied?.(top);
  };

  const deadline = Date.now() + RESTORE_DEADLINE_MS;
  const tick = () => {
    if (stopped) return;
    apply();
    if (window.scrollY >= top - RESTORE_TOLERANCE_PX || Date.now() >= deadline) {
      stop();
      return;
    }
    timer = window.setTimeout(tick, RESTORE_STEP_MS);
  };

  raf = requestAnimationFrame(tick);
  if (top > 0) {
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
  }
  return stop;
}
