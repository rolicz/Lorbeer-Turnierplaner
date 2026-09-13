/**
 * Single/multi choice pills (`DESIGN.md` §7). `Chip` is one selectable pill,
 * `ChipGroup` a wrapping row of them (never overflows, unlike a segmented switch).
 *
 * Moved here from `pages/stats/charts.tsx` (DS1); DS6 repointed every stats call site
 * and removed both the re-export and the older `ToggleChip` copy in `stats/controls.tsx`.
 */
/* eslint-disable react-refresh/only-export-components -- `chipClass` ships with the
   component it styles, like `buttonClass` in Button.tsx (DS6). */
import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Both states carry a 1px edge so selecting a chip never shifts the row:
 * selected = accent wash, unselected = chip surface + hairline (the hairline is
 * what makes an unselected chip visible on the white `card` of the light theme).
 */
const CHIP_BASE = "rounded-full border px-3 py-1.5 text-sm transition focus-ring";
const CHIP_ON = "border-accent/40 bg-accent/15 font-medium text-accent";
const CHIP_OFF =
  "border-border-card-chip/40 bg-bg-card-chip/50 text-text-muted hover:text-text-normal";

/**
 * The chip surface as a class string, for a button that must not be a `Chip`:
 * a popover trigger carries `aria-haspopup`/`aria-expanded`, never the
 * `aria-pressed` toggle semantics `Chip` gives every button (S9).
 */
export function chipClass(selected = false, className?: string): string {
  return cn(CHIP_BASE, selected ? CHIP_ON : CHIP_OFF, className);
}

export function Chip({
  selected = false,
  onClick,
  disabled = false,
  children,
  className,
  title,
  ariaLabel,
}: {
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel}
      title={title}
      className={cn(CHIP_BASE, selected ? CHIP_ON : CHIP_OFF, disabled && "opacity-50", className)}
    >
      {children}
    </button>
  );
}

/** Wrapping pill selector — one option is always selected. */
export function ChipGroup<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => (
        <Chip key={String(o.key)} selected={o.key === value} onClick={() => onChange(o.key)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}
