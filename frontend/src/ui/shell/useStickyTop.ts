import { useEffect, useState } from "react";

import { useHideOnScroll } from "../layout/useHideOnScroll";

/**
 * Where page-level sticky content has to pin so it does not slide under the app's own
 * chrome (Q3).
 *
 * Two things have to be true at once, which is why this is a hook and not a constant:
 *
 * 1. **The height is measured, never assumed.** `#app-top-nav` is `h-14` *plus* its
 *    bottom hairline *plus* `env(safe-area-inset-top)` — 57px on a plain 390px phone and
 *    more under a notch. A hard-coded `3.5rem` is already a pixel wrong on the Pi's
 *    Chromium and arbitrarily wrong on an iPhone, and it would rot the day the bar grows
 *    a row. `offsetHeight` is the truth, and a `ResizeObserver` keeps it true. On desktop
 *    the bar is `lg:hidden`, so its height is 0 and the offset collapses to the top of
 *    the page — which is right, because the desktop title row scrolls away with the page.
 * 2. **It follows the bar's auto-hide.** The bar slides up on scroll-down and drops back
 *    on any scroll-up (`useHideOnScroll`). A header pinned at a fixed 57px would leave a
 *    57px band of moving content above itself for as long as the bar is away, which is
 *    most of the time you spend scrolling a long grid; pinning at 0 instead would park it
 *    under the bar the moment you scroll back up. So it docks under the bar when the bar
 *    is there and rides to the very top when it is not — the same state, from the same
 *    hook, driven by the same scroll events, so the two can never disagree. Give the
 *    sticky element the bar's own transition and they move as one piece.
 */

/** Mirrors `MobileChrome`'s `useHideOnScroll(72)`. A drift here would only matter inside
 *  the first 72px of scroll, where nothing is pinned yet. */
const TOP_BAR_HIDE_THRESHOLD = 72;

export function useStickyTop(): number {
  const { hidden } = useHideOnScroll(TOP_BAR_HIDE_THRESHOLD);
  const [barH, setBarH] = useState(0);

  useEffect(() => {
    const el = document.getElementById("app-top-nav");
    if (!el) return; // no chrome (tests, a shell-less route): pin to the page top
    // `display: none` (desktop) measures 0, which is exactly the offset we want there.
    const read = () => setBarH(el.offsetHeight);
    read();
    // The resize listener is not redundant: it is the belt for the breakpoint crossing,
    // where the bar goes `display: none` and a ResizeObserver's 0×0 report is the braces.
    window.addEventListener("resize", read);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    ro?.observe(el);
    return () => {
      window.removeEventListener("resize", read);
      ro?.disconnect();
    };
  }, []);

  return hidden ? 0 : barH;
}
