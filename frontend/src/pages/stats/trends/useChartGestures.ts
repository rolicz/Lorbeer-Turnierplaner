/** Touch pinch/pan gestures for the Trends chart's x-axis window. */
import { useEffect, useRef, type RefObject } from "react";

const DAY = 864e5;

type Win = { t0: number; t1: number };

/**
 * Installs touch handlers on the plot element:
 *  - pinch (two fingers) zooms the x-axis window,
 *  - one-finger horizontal drag pans, while vertical scrolls the page.
 * The current window/bounds are mirrored into refs so the listener (installed
 * once) always reads fresh values without re-binding on every render.
 */
export function useChartGestures({
  plotRef, win, dataMin, dataMax, setManualWin,
}: {
  plotRef: RefObject<HTMLDivElement>;
  win: Win;
  dataMin: number;
  dataMax: number;
  setManualWin: (w: Win) => void;
}) {
  const winRef = useRef(win);
  useEffect(() => { winRef.current = win; }, [win]);
  // Always show tournament labels; allow panning slightly left of the first event
  // so its (down-left) label can be read fully — without shifting the y-axis.
  const boundsRef = useRef({ dataMin, dataMax });
  useEffect(() => { boundsRef.current = { dataMin, dataMax }; }, [dataMin, dataMax]);

  // Pinch = zoom x-axis window; one-finger horizontal drag = pan; vertical = page scroll.
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const clampWin = (t0: number, t1: number) => {
      const { dataMin: lo, dataMax: hi } = boundsRef.current;
      const full = Math.max(DAY, hi - lo);
      const w = Math.min(Math.max(t1 - t0, 20 * DAY), full);
      // Extra scroll room on the left (in time) for the first tournament label.
      const innerWpx = Math.max(60, (el.clientWidth - 16) - 32 - 12);
      const leadTime = (90 / innerWpx) * w;
      const loEff = lo - leadTime;
      let nt0 = t0;
      let nt1 = t0 + w;
      if (nt1 > hi) { nt1 = hi; nt0 = hi - w; }
      if (nt0 < loEff) { nt0 = loEff; nt1 = loEff + w; }
      return { t0: nt0, t1: Math.min(nt1, hi) };
    };
    let pinch = false;
    let panDecided: boolean | null = null;
    let startDist = 0;
    let startMidFrac = 0;
    let startX = 0;
    let startY = 0;
    let startW = { t0: 0, t1: 0 };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch = true; panDecided = null;
        startDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const r = el.getBoundingClientRect();
        startMidFrac = Math.max(0, Math.min(1, ((e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left) / Math.max(1, r.width)));
        startW = winRef.current;
      } else if (e.touches.length === 1) {
        pinch = false; panDecided = null;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY; startW = winRef.current;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const f = Math.max(0.05, dist / Math.max(1, startDist));
        const w0 = startW.t1 - startW.t0;
        const tm = startW.t0 + startMidFrac * w0;
        const newW = w0 / f;
        setManualWin(clampWin(tm - startMidFrac * newW, tm + (1 - startMidFrac) * newW));
      } else if (!pinch && e.touches.length === 1) {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (panDecided === null) {
          if (Math.abs(dx) > Math.abs(dy) + 4) panDecided = true;
          else if (Math.abs(dy) > Math.abs(dx) + 4) panDecided = false;
        }
        if (panDecided) {
          e.preventDefault();
          const w0 = startW.t1 - startW.t0;
          const shift = -(dx / Math.max(1, el.clientWidth)) * w0;
          setManualWin(clampWin(startW.t0 + shift, startW.t1 + shift));
        }
      }
    };
    const onEnd = (e: TouchEvent) => { if (e.touches.length === 0) { pinch = false; panDecided = null; } };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
