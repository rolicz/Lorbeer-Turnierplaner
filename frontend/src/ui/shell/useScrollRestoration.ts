import { useEffect, useRef } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router-dom";

import { restoreWindowScroll } from "../scroll";
import { currentHistoryIndex, saveScroll, scrollFor } from "./navStack";

/** How long an unreachable offset stays "pending" before we stop chasing it. */
const GIVE_UP_MS = 1700;

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
 * wrong. Restoring goes through `restoreWindowScroll` (instant, with retries for
 * content that arrives after paint).
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
  // Whether `yRef` describes the entry on screen. Until something scrolls (or a
  // restore lands), this page's offset is simply unknown — and must not be
  // written over the one storage already holds. React's StrictMode remount in
  // dev would otherwise wipe every offset with a fresh 0.
  const yKnownRef = useRef(false);
  const firstRunRef = useRef(true);
  // Offset we are still trying to reach for the current entry, if any.
  const pendingRef = useRef<number | null>(null);

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
      yKnownRef.current = true;
    };
    const persist = () => {
      if (yKnownRef.current) saveScroll(idxRef.current, yRef.current, pathRef.current);
    };
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
    const idx = currentHistoryIndex();
    const path = location.pathname;
    const prevIdx = idxRef.current;
    const prevPath = pathRef.current;
    // Same history entry, same page: a `replace` that only rewrote query params.
    const sameEntry = !firstRunRef.current && idx === prevIdx && path === prevPath;
    // A restore can still be chasing content that has not arrived yet. Such a
    // replace (a page cleaning up its URL right after it mounts) must not write
    // the not-yet-restored offset over the one it is trying to reach, and must
    // not silently drop the attempt when its effect cleanup cancels the loop.
    const restoring = sameEntry && pendingRef.current != null;

    // On the very first run there is nothing outgoing — and writing here would
    // overwrite the offset a reload is about to restore.
    if (!firstRunRef.current && !restoring && yKnownRef.current) saveScroll(prevIdx, yRef.current, prevPath);
    firstRunRef.current = false;
    idxRef.current = idx;
    pathRef.current = path;
    if (!sameEntry) yKnownRef.current = false;

    let target: number | null = null;
    if (navType === NavigationType.Pop) target = scrollFor(idx, path) ?? 0;
    else if (navType === NavigationType.Push) target = 0;
    else if (path !== prevPath) target = 0; // replace that swaps the page (login redirect, /→/dashboard)
    else if (restoring) target = pendingRef.current; // keep chasing the offset

    // An in-page param update (filters, tabs, cleaned-up deep links) keeps its place;
    // a hash target belongs to whoever owns that anchor.
    if (target == null || location.hash) return;

    pendingRef.current = target > 0 ? target : null;
    const cancel = restoreWindowScroll(target, (top) => {
      yRef.current = top;
      yKnownRef.current = true;
      if (Math.abs(window.scrollY - top) <= 4) pendingRef.current = null;
    });
    // Give up on an offset the page can never reach (it got shorter for good).
    const giveUp = window.setTimeout(() => {
      pendingRef.current = null;
    }, GIVE_UP_MS);
    return () => {
      cancel();
      window.clearTimeout(giveUp);
    };
  }, [location.key, location.pathname, location.search, location.hash, navType]);
}
