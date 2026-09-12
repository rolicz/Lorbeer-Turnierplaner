/**
 * Key number on an inset surface: big tabular value, small muted label, optional
 * context line and an accessory (badge/chip) at the label's right edge.
 * `DESIGN.md` §7: an `inset` surface, `text-2xl font-bold tabular-nums` value and a
 * `text-xs` muted label.
 */
import React from "react";

import { cn } from "../cn";

export default function StatTile({
  label,
  value,
  hint,
  accessory,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Small muted line under the value (who, when, ties …). */
  hint?: React.ReactNode;
  /** Rendered next to the label, right-aligned (e.g. a "record" chip). */
  accessory?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("inset", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 text-xs text-text-muted">{label}</span>
        {accessory ?? null}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-text-normal">{value}</div>
      {hint ? <div className="mt-0.5 text-xs leading-snug text-text-muted">{hint}</div> : null}
    </div>
  );
}
