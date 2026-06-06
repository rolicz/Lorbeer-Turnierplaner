/**
 * In-page horizontal tab strip that shows one section at a time.
 * Replaces the scroll-spy SubNav machinery for pages with multiple sections.
 */
import { type ReactNode, useId } from "react";
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

export function SectionTabs<K extends string>({ tabs, active, onChange, className }: Props<K>) {
  const id = useId();
  return (
    <div
      role="tablist"
      aria-label="Page sections"
      className={cn(
        "no-scrollbar -mx-4 flex overflow-x-auto border-b border-border-card-chip/60 px-4 lg:-mx-6 lg:px-6",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            id={`${id}-${tab.key}`}
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
                  "ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
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
  );
}
