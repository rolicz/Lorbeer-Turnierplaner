import { useEffect, useRef, useState } from "react";

/**
 * Auto-hiding top bar behaviour: returns `hidden=true` after the user scrolls
 * down past a threshold, and `false` (revealed) the moment they scroll up — the
 * common mobile-app pattern. Always shown near the very top of the page.
 */
export type HideOnScroll = { hidden: boolean; atTop: boolean };

export function useHideOnScroll(threshold = 64): HideOnScroll {
  const [hidden, setHidden] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastY.current = window.scrollY;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY);
        const delta = y - lastY.current;

        setAtTop(y < 8);

        if (y < threshold) {
          setHidden(false); // always reveal near the top
        } else if (delta > 4) {
          setHidden(true); // scrolling down -> hide
        } else if (delta < -4) {
          setHidden(false); // any upward scroll -> reveal (drop down)
        }
        lastY.current = y;
        ticking.current = false;
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return { hidden, atTop };
}
