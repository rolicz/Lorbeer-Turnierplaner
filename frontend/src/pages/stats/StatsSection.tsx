/**
 * The stats sub-view skeleton (`DESIGN.md` §6 "Stats sub-view skeleton").
 *
 *   STREAK · LONGEST WIN RUN ───────────  ← section-head + section-label (icon first)
 *   Most wins in a row without a loss.    ← optional one-line muted explainer
 *   1  Flo      2026-03 … 2026-05    7    ← rows: List/ListRow, ScoreLine or StatTile
 *
 * Every block of every stats sub-view uses this, so Records, Streaks, H2H, Positions,
 * Cups and the matchup are cut from the same stone. Never hand-roll a `section-head`
 * in a stats sub-view.
 */
import type { ReactNode } from "react";

import { cn } from "../../ui/cn";

export default function StatsSection({
  label,
  icon,
  explainer,
  action,
  children,
  className,
}: {
  label: ReactNode;
  /** Lucide icon node, rendered before the label (category blocks). */
  icon?: ReactNode;
  /** One muted line under the header saying what the block means. */
  explainer?: ReactNode;
  /** Trailing action (link, ghost `Button`, switch); the hairline runs between it and the label. */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="section-head">
        <span className="section-label inline-flex min-w-0 items-center gap-1.5">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        {action ? <span className="order-1 shrink-0">{action}</span> : null}
      </div>
      {explainer ? <p className="-mt-1 text-xs text-text-muted">{explainer}</p> : null}
      {children}
    </div>
  );
}
