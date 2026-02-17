import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UsePullToRefreshArgs = {
  enabled?: boolean;
  onRefresh: () => Promise<void> | void;
  thresholdPx?: number;
  maxPullPx?: number;
  damping?: number;
};

type PullToRefreshState = {
  distance: number;
  active: boolean;
  ready: boolean;
  refreshing: boolean;
};

function isTouchCapable() {
  if (typeof window === "undefined") return false;
  return ("ontouchstart" in window) || (navigator.maxTouchPoints ?? 0) > 0;
}

function closestMatch(el: EventTarget | null, selector: string): boolean {
  if (!(el instanceof Element)) return false;
  return !!el.closest(selector);
}

export function usePullToRefresh({
  enabled = true,
  onRefresh,
  thresholdPx = 78,
  maxPullPx = 128,
  damping = 0.55,
}: UsePullToRefreshArgs): PullToRefreshState {
  const [distance, setDistance] = useState(0);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const trackingRef = useRef(false);
  const draggingRef = useRef(false);
  const refreshingRef = useRef(false);
  const readyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetVisual = useCallback(() => {
    if (!mountedRef.current) return;
    setDistance(0);
    setReady(false);
    readyRef.current = false;
    setActive(false);
  }, []);

  const finishRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (mountedRef.current) {
      setRefreshing(true);
      setActive(true);
      setReady(true);
      readyRef.current = true;
      setDistance(Math.max(thresholdPx * 0.72, 44));
    }
    try {
      await onRefresh();
    } finally {
      window.setTimeout(() => {
        refreshingRef.current = false;
        if (!mountedRef.current) return;
        setRefreshing(false);
        resetVisual();
      }, 180);
    }
  }, [onRefresh, resetVisual, thresholdPx]);

  useEffect(() => {
    if (!enabled) return;
    if (!isTouchCapable()) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (e.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      if (closestMatch(e.target, "input, textarea, select, [contenteditable='true'], [data-no-pull-refresh='1']")) return;

      const t = e.touches[0];
      startYRef.current = t.clientY;
      startXRef.current = t.clientX;
      trackingRef.current = true;
      draggingRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current) return;
      if (refreshingRef.current) return;
      if (e.touches.length !== 1) return;

      const t = e.touches[0];
      const dy = t.clientY - startYRef.current;
      const dx = Math.abs(t.clientX - startXRef.current);

      if (!draggingRef.current) {
        if (dy <= 6) return;
        // Keep horizontal gestures (charts/nav swipes) intact.
        if (dx > dy * 0.9) {
          trackingRef.current = false;
          return;
        }
        if (window.scrollY > 0) {
          trackingRef.current = false;
          return;
        }
        draggingRef.current = true;
      }

      if (dy <= 0) {
        setDistance(0);
        setReady(false);
        setActive(false);
        return;
      }

      // Prevent native overscroll while we are in pull-to-refresh gesture.
      e.preventDefault();

      const d = Math.min(maxPullPx, dy * damping);
      setDistance(d);
      const isReady = d >= thresholdPx;
      setReady(isReady);
      readyRef.current = isReady;
      setActive(true);
    };

    const onTouchEnd = () => {
      if (!trackingRef.current) return;
      trackingRef.current = false;

      const wasDragging = draggingRef.current;
      draggingRef.current = false;
      if (!wasDragging) return;

      if (readyRef.current) {
        void finishRefresh();
      } else {
        resetVisual();
      }
    };

    const onTouchCancel = () => {
      trackingRef.current = false;
      draggingRef.current = false;
      if (!refreshingRef.current) resetVisual();
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart as EventListener);
      window.removeEventListener("touchmove", onTouchMove as EventListener);
      window.removeEventListener("touchend", onTouchEnd as EventListener);
      window.removeEventListener("touchcancel", onTouchCancel as EventListener);
    };
  }, [damping, enabled, finishRefresh, maxPullPx, resetVisual, thresholdPx]);

  return useMemo(
    () => ({ distance, active, ready, refreshing }),
    [distance, active, ready, refreshing]
  );
}
