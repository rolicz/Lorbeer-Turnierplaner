import { useCallback, useEffect, useState } from "react";

import { scrollToSectionById } from "../scrollToSection";

export type SubnavSection = {
  key: string;
  id: string;
};

export function useSectionSubnav({
  sections,
  enabled = true,
}: {
  sections: ReadonlyArray<SubnavSection>;
  enabled?: boolean;
}) {
  const [activeKey, setActiveKey] = useState<string>(sections[0]?.key ?? "");
  const [blinkKey, setBlinkKey] = useState<string | null>(null);
  const [scrollLock, setScrollLock] = useState<{ untilTs: number; key: string | null }>({
    untilTs: 0,
    key: null,
  });

  // Keep active key valid when available sections change.
  useEffect(() => {
    if (!enabled) return;
    if (!sections.length) return;
    const valid = sections.some((s) => s.key === activeKey);
    if (valid) return;
    const next = sections[0]?.key ?? "";
    if (!next) return;
    window.setTimeout(() => setActiveKey(next), 0);
  }, [activeKey, enabled, sections]);

  const jumpToSection = useCallback(
    (
      key: string,
      id: string,
      {
        blink = false,
        lockMs = 700,
        retries = 12,
        offsetPx = 0,
        behavior = "smooth",
      }: {
        blink?: boolean;
        lockMs?: number;
        retries?: number;
        offsetPx?: number;
        behavior?: ScrollBehavior;
      } = {}
    ) => {
      setActiveKey(key);
      setScrollLock({ untilTs: Date.now() + lockMs, key });

      if (blink) {
        setBlinkKey(key);
        window.setTimeout(() => {
          setBlinkKey((cur) => (cur === key ? null : cur));
        }, 460);
      }

      window.setTimeout(() => {
        scrollToSectionById(id, retries, offsetPx, behavior);
      }, 0);

      window.setTimeout(() => {
        setScrollLock((cur) => (cur.key === key ? { untilTs: 0, key: null } : cur));
      }, lockMs + 60);
    },
    []
  );

  useEffect(() => {
    if (!enabled || !sections.length) return;
    let raf = 0;

    const updateActiveByViewport = () => {
      raf = 0;
      if (scrollLock.key && Date.now() < scrollLock.untilTs) {
        const locked = scrollLock.key;
        setActiveKey((prev) => (prev === locked ? prev : locked));
        return;
      }
      if (scrollLock.key && Date.now() >= scrollLock.untilTs) {
        setScrollLock({ untilTs: 0, key: null });
      }

      const header = document.getElementById("app-top-nav");
      const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      const anchorY = headerHeight + 8;

      let nextKey = sections[0]?.key ?? "";
      for (const sec of sections) {
        const el = document.getElementById(sec.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= anchorY + 1) {
          nextKey = sec.key;
        } else {
          break;
        }
      }
      if (!nextKey) return;
      setActiveKey((prev) => (prev === nextKey ? prev : nextKey));
    };

    const onScrollOrResize = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(updateActiveByViewport);
    };

    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    onScrollOrResize();

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [enabled, scrollLock, sections]);

  return {
    activeKey,
    blinkKey,
    jumpToSection,
  };
}
