import { useEffect, useRef } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router-dom";

import { currentHistoryIndex, saveScroll, scrollFor } from "./navStack";

/**
 * Retries after the first (immediate) attempt, in ms. Content that arrives late —
 * a lazy route chunk, the ~140ms route-entry skeleton, a query that resolves after
 * paint — makes the document too short for the saved offset, and the browser
 * silently clamps the scroll. Each retry only *re-applies* when we are still above
 * the target, so it can never undo the user's own scrolling or a page's deliberate
 * scroll-into-view.
 */
const RETRY_MS = [120, 360];

/** Only re-apply when we are this far short of the target (px). */
const TOLERANCE = 4;

/**
 * Browser-grade scroll restoration for the SPA.
 *
 * React Router never touches the scroll position: going back from a match page
 * dropped you at the top of the tournament you came from, and every forward
 * navigation kept the previous page's offset. This hook gives each history entry
 * its own remembered offset (`navStack`, sessionStorage):
 *
 * - **POP** (chevron, swipe, browser back/forward, and the initial load/reload) →
 *   restore the offset that entry was left at, or the top when we never saw it.
 * - **PUSH** → top, like following a link in a document.
 * - **REPLACE** → top only when the page itself changed; a replace that merely
 *   rewrites query params (every stats filter, every `?tab=`) must leave the
 *   scroll exactly where it is.
 *
 * Offsets are captured from `scroll` events rather than read at navigation time:
 * by the time an effect runs, the new (often shorter) page is laid out and the
 * browser has already clamped `window.scrollY`, so the outgoing value would be
 * wrong. Restoration is always instant (`behavior: "auto"`) — smooth scrolling on
 * a back navigation reads as a glitch, and `prefers-reduced-motion` forbids it.
 *
 * Mounted once, in `AppShell`.
 */
export function useScrollRestoration(): void {
  const location = useLocation();
  const navType = useNavigationType();

  // The entry currently on screen: its history index, its pathname and the last
  // offset we saw it at. All three describe the *outgoing* entry while the effect
  // below runs, which is exactly what has to be saved.
  const idxRef = useRef<number>(currentHistoryIndex());
  const pathRef = useRef<string>(location.pathname);
  const yRef = useRef<number>(0);
  const firstRunRef = useRef(true);

  useEffect(() => {
    // Take scroll restoration away from the browser: it would fire its own restore
    // against the not-yet-rendered page and land at the top (or fight ours).
    try {
      if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    } catch {
      // ignore (some embedded webviews)
    }

    const onScroll = () => {
      yRef.current = window.scrollY;
    };
    const persist = () => saveScroll(idxRef.current, yRef.current, pathRef.current);
    const onHide = () => {
      if (document.visibilityState === "hidden") persist();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // A reload / app switch never runs the location effect, so persist here too.
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      persist();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => {
    const prevIdx = idxRef.current;
    const prevPath = pathRef.current;
    // On the very first run there is nothing outgoing — and writing here would
    // overwrite the offset a reload is about to restore.
    if (!firstRunRef.current) saveScroll(prevIdx, yRef.current, prevPath);
    firstRunRef.current = false;

    const idx = currentHistoryIndex();
    const path = location.pathname;
    idxRef.current = idx;
    pathRef.current = path;

    let target: number | null = null;
    if (navType === NavigationType.Pop) target = scrollFor(idx, path) ?? 0;
    else if (navType === NavigationType.Push) target = 0;
    else if (path !== prevPath) target = 0; // replace that swaps the page (login redirect, /→/dashboard)

    // An in-page param update (filters, tabs, cleaned-up deep links) keeps its place;
    // a hash target belongs to whoever owns that anchor.
    if (target == null || location.hash) return;

    const top = target;
    const apply = () => {
      window.scrollTo({ top, left: 0, behavior: "auto" });
      yRef.current = top;
    };
    const raf = requestAnimationFrame(apply);
    const timers = RETRY_MS.map((ms) =>
      window.setTimeout(() => {
        if (window.scrollY < top - TOLERANCE) apply();
      }, ms),
    );
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [location.key, location.pathname, location.search, location.hash, navType]);
}
