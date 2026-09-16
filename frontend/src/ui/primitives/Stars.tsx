/**
 * Club star rating in lucide (`DESIGN.md` §7) — the replacement for `StarsFA`.
 * Same props (plus an optional pixel `size`, since lucide icons do not inherit the
 * font size the way the Font Awesome glyphs did). `StarsFA` stays until DS7 swaps
 * every caller over.
 */
import { Star, StarHalf } from "lucide-react";

import { clamp } from "../../helpers";

/** Outline star with its left half filled — lucide's StarHalf alone has no right edge. */
function HalfStar({ size }: { size: number }) {
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }} aria-hidden="true">
      <Star size={size} strokeWidth={1.75} />
      <StarHalf size={size} strokeWidth={1.75} fill="currentColor" className="absolute inset-0" />
    </span>
  );
}

export function Stars({
  rating,
  className = "",
  title,
  textClassName,
  size = 14,
}: {
  rating: number;
  className?: string;
  title?: string;
  textClassName?: string;
  /** Icon edge length in px (14 next to `text-xs`/`text-sm`, 16 from `text-base` up). */
  size?: number;
}) {
  const r = clamp(Number.isFinite(rating) ? rating : 0, 0, 5);
  const rounded = Math.round(r * 2) / 2; // 0.5 steps
  const full = Math.floor(rounded);
  const half = rounded - full >= 0.5;
  const empty = Math.max(0, 5 - full - (half ? 1 : 0));

  const aria = title ?? `${rounded.toFixed(1).replace(/\.0$/, "")} out of 5 stars`;
  const textCls = textClassName ?? "text-text-muted";

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${textCls} ${className}`}
      title={aria}
      role="img"
      aria-label={aria}
    >
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f-${i}`} size={size} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
      ))}
      {half && <HalfStar size={size} />}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e-${i}`} size={size} strokeWidth={1.75} aria-hidden="true" />
      ))}
    </span>
  );
}

/**
 * The same rating as one token — a filled star and the number (`★ 3.5`).
 *
 * Five outlined glyphs are a picture of a rating and are right where there is room
 * for a picture (the hero panel, a club slot, the Clubs page's rows). In a dense
 * list they are ~80px spent on one number per side, and the number is what the
 * reader actually compares — the Clubs page already names its star groups this way
 * (`4.5★`). `mirror` puts the glyph on the outside instead, so a mirrored pair keeps
 * both numbers next to the centre gap (Q7).
 */
export function StarsToken({
  rating,
  mirror = false,
  size = 12,
  className = "",
}: {
  rating: number;
  /** Right-hand side of a mirrored pair: number first, then the glyph. */
  mirror?: boolean;
  size?: number;
  className?: string;
}) {
  const r = clamp(Number.isFinite(rating) ? rating : 0, 0, 5);
  const rounded = Math.round(r * 2) / 2;
  const text = rounded.toFixed(1).replace(/\.0$/, "");
  const aria = `${text} out of 5 stars`;
  const glyph = <Star size={size} strokeWidth={1.75} fill="currentColor" aria-hidden="true" className="shrink-0" />;

  return (
    <span
      // `tabular-nums` but not `font-mono`: this token follows a league name of any
      // length rather than sitting in a column, and a mono `.` sets "3.5" a third
      // wider than it needs to be (DESIGN.md §5's rule is about columns).
      className={`inline-flex items-center gap-0.5 tabular-nums ${className}`}
      title={aria}
      role="img"
      aria-label={aria}
    >
      {mirror ? null : glyph}
      {text}
      {mirror ? glyph : null}
    </span>
  );
}

export default Stars;
