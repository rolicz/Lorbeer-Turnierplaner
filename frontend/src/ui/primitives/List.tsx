import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { cn } from "../cn";

/**
 * Flat, full-width list with hairline separators between rows — the canonical
 * list pattern for the design-system overhaul (replaces nested cards).
 */
export function List({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("list-divided", className)}>{children}</div>;
}

type ListRowOwnProps = {
  /** Leading slot: avatar, icon, rank badge… */
  leading?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Trailing slot: value, status pill, action buttons… (stays clickable). */
  trailing?: React.ReactNode;
  /** Primary action: navigate (Link). */
  to?: string;
  state?: unknown;
  /** Primary action: callback (button). */
  onClick?: () => void;
  /** Accessible label for the stretched primary link/button (defaults to title). */
  ariaLabel?: string;
  /** Show a trailing chevron (defaults on for interactive rows w/o trailing). */
  chevron?: boolean;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  /** Custom row body, replaces title/subtitle. */
  children?: React.ReactNode;
};

/**
 * A single dense list row. The whole row is clickable via a stretched-link
 * overlay (so `trailing` may contain its own buttons without nesting), or it can
 * be a plain row. Provide `leading`/`title`/`subtitle`/`trailing`, or `children`.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  to,
  state,
  onClick,
  ariaLabel,
  chevron,
  active = false,
  disabled = false,
  className,
  children,
}: ListRowOwnProps) {
  const interactive = Boolean(to || onClick);
  const showChevron = chevron ?? (interactive && trailing == null);
  const label = ariaLabel ?? (typeof title === "string" ? title : undefined);

  const overlayClass = "absolute inset-0 z-0 rounded-lg focus-ring";
  const overlay = !interactive ? null : to ? (
    <Link to={to} state={state} aria-label={label} className={overlayClass} aria-current={active ? "page" : undefined} />
  ) : (
    <button type="button" onClick={onClick} aria-label={label} className={overlayClass} disabled={disabled} />
  );

  return (
    <div
      className={cn(
        "row relative",
        interactive && "row-tap",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {overlay}
      <div className="pointer-events-none relative z-10 flex w-full items-center gap-3">
        {leading != null ? <span className="shrink-0">{leading}</span> : null}
        <span className="min-w-0 flex-1">
          {children ?? (
            <>
              <span className={cn("block truncate font-medium", active ? "text-accent" : "text-text-normal")}>
                {title}
              </span>
              {subtitle != null ? (
                <span className="mt-0.5 block truncate text-xs text-text-muted">{subtitle}</span>
              ) : null}
            </>
          )}
        </span>
        {trailing != null ? (
          <span className="pointer-events-auto flex shrink-0 items-center gap-2 text-right">{trailing}</span>
        ) : null}
        {showChevron ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-text-muted/70" aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}
