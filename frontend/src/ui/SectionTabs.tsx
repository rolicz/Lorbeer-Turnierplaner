/**
 * In-page horizontal tab strip that shows one section at a time.
 * Replaces the scroll-spy SubNav machinery for pages with multiple sections.
 */
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "./cn";

export type SectionTab<K extends string = string> = {
  key: K;
  label: string;
  icon?: ReactNode;
  /** Optional count rendered as a small pill after the label (e.g. unread comments). */
  badge?: number;
};

type Props<K extends string> = {
  tabs: SectionTab<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
};

/**
 * The strip's own end padding (`px-4` plus the last button's `mr-1`) is
 * scrollable but hides nothing, so ignore that much slack — otherwise the last
 * tab sits under a fade that makes it look cut off.
 */
const EDGE_SLACK_PX = 24;

export function SectionTabs<K extends string>({ tabs, active, onChange, className }: Props<K>) {
  const id = useId();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Whether the strip can still scroll either way — drives the edge fades.
  const syncOverflow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > EDGE_SLACK_PX);
    setCanScrollRight(el.scrollLeft < max - EDGE_SLACK_PX);
  }, []);

  const tabCount = tabs.length;
  useEffect(() => {
    syncOverflow();
    const el = scrollerRef.current;
    // jsdom has no ResizeObserver; the initial sync above is enough there.
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(syncOverflow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncOverflow, tabCount]);

  // Keep the selected tab visible when it changes (e.g. via a deep link).
  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-tab-key="${active}"]`);
    el?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
    syncOverflow();
  }, [active, syncOverflow]);

  return (
    <div className={cn("relative -mx-4 lg:-mx-6", className)}>
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label="Page sections"
        onScroll={syncOverflow}
        data-no-swipe-nav
        className="no-scrollbar flex overflow-x-auto border-b border-border-card-chip/60 px-4 lg:px-6"
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              id={`${id}-${tab.key}`}
              data-tab-key={tab.key}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => onChange(tab.key)}
              className={cn(
                "relative mr-1 flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                isActive
                  ? "text-accent after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-accent after:content-['']"
                  : "text-text-muted hover:text-text-normal",
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge ? (
                <span
                  className={cn(
                    "ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
                    isActive ? "bg-accent/15 text-accent" : "bg-bg-card-chip/70 text-text-muted",
                  )}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {canScrollLeft ? (
        <div
          aria-hidden="true"
          data-tabs-fade="left"
          className="pointer-events-none absolute bottom-px left-0 top-0 w-8 bg-gradient-to-r from-bg-default to-transparent"
        />
      ) : null}
      {canScrollRight ? (
        <div
          aria-hidden="true"
          data-tabs-fade="right"
          className="pointer-events-none absolute bottom-px right-0 top-0 w-8 bg-gradient-to-l from-bg-default to-transparent"
        />
      ) : null}
    </div>
  );
}
