import { useCallback, useEffect, useMemo, useState } from "react";

import { scrollToSectionById } from "../scrollToSection";

export type SubnavSection = {
  key: string;
  id: string;
};

export function useSectionSubnav({
  sections,
  enabled = true,
  initialKey,
}: {
  sections: ReadonlyArray<SubnavSection>;
  enabled?: boolean;
  initialKey?: string;
}) {
  const [activeKey, setActiveKey] = useState<string>(() => {
    if (initialKey && sections.some((s) => s.key === initialKey)) return initialKey;
    return sections[0]?.key ?? "";
  });
  const [blinkKey, setBlinkKey] = useState<string | null>(null);
  const [scrollLock, setScrollLock] = useState<{ untilTs: number; key: string | null }>({
    untilTs: 0,
    key: null,
  });

  const computedActiveKey = useMemo(() => {
    if (sections.some((s) => s.key === activeKey)) return activeKey;
    if (initialKey && sections.some((s) => s.key === initialKey)) return initialKey;
    return sections[0]?.key ?? "";
  }, [activeKey, initialKey, sections]);

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

      scrollToSectionById(id, retries, offsetPx, behavior);

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
    activeKey: computedActiveKey,
    blinkKey,
    jumpToSection,
  };
}
