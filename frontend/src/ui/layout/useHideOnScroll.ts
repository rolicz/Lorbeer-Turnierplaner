import { useEffect, useRef, useState } from "react";

/**
 * Auto-hiding top bar behaviour: returns `hidden=true` after the user scrolls
 * down past a threshold, and `false` (revealed) the moment they scroll up — the
 * common mobile-app pattern. Always shown near the very top of the page.
 */
export function useHideOnScroll(threshold = 64): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastY.current = window.scrollY;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const last = lastY.current;
        const delta = y - last;

        if (y < threshold) {
          // Always reveal near the top.
          setHidden(false);
        } else if (delta > 6) {
          // Scrolling down meaningfully -> hide.
          setHidden(true);
        } else if (delta < -6) {
          // Scrolling up -> reveal immediately.
          setHidden(false);
        }
        lastY.current = y;
        ticking.current = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hidden;
}
