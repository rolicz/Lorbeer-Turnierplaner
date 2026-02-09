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

