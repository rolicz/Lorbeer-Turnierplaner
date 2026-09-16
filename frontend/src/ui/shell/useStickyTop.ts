import { useEffect, useState } from "react";

import { useHideOnScroll } from "../layout/useHideOnScroll";

/**
 * Where page-level sticky content has to pin so it does not slide under the app's own
 * chrome (Q3) — or under the phone's (Q11).
 *
 * Three things have to be true at once, which is why this is a hook and not a constant:
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
 * 3. **It never goes above the safe area** (Q11). With the bar away the offset is 0, and
 *    0 is the top of the *window* — which on a desktop is the top of the page and on a
 *    notched iPhone is the strip the clock and the battery sit in, because the app asks
 *    for `viewport-fit=cover` and a `black-translucent` status bar (`index.html`) and so
 *    draws underneath it deliberately. A header pinned there is present and unreadable.
 *    So the answer is a **floor**, not a second offset: `max(<bar>, safe-area-inset-top)`.
 *    It is a CSS `max()` rather than a measured number because `env()` is the only live
 *    source for that inset — it changes with rotation, with a call banner, with the
 *    device — and CSS re-resolves it without a listener. Where there is no inset (every
 *    desktop, every Android) it is 0px and nothing moves; while the bar is shown its
 *    measured height already contains the inset (`pt-safe-t`), so the floor is invisible
 *    there too. The floor lives here and not at the call sites on purpose: a caller that
 *    forgets it has the Q11 bug back, silently and only on a phone.
 *
 * The return value is therefore a CSS length, ready for `top` — not a number.
 */

/** Mirrors `MobileChrome`'s `useHideOnScroll(72)`. A drift here would only matter inside
 *  the first 72px of scroll, where nothing is pinned yet. */
const TOP_BAR_HIDE_THRESHOLD = 72;

/** The OS's own strip. `tailwind.config.cjs` spells the same thing as `safe-t` for classes. */
const SAFE_AREA_TOP = "env(safe-area-inset-top, 0px)";

export function useStickyTop(): string {
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

  return `max(${hidden ? 0 : barH}px, ${SAFE_AREA_TOP})`;
}
