/**
 * Two/three view modes with a sliding accent indicator (`DESIGN.md` §7).
 *
 * Radius: the track is `rounded-xl` (12px, the canon's control radius) and the
 * segments plus the indicator are `rounded-lg` (8px) — the one documented
 * exception to §4's "never `rounded-lg`": a segment nested inside a 12px track
 * with 4px of padding cannot itself be 12px without its corners cutting the
 * track's. The selected segment wears `Chip`'s selected state verbatim
 * (accent/15 wash, accent/40 edge, accent text).
 */
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

type Primitive = string | number | boolean;

export type SegmentedOption<T extends Primitive> = {
  key: T;
  label: string;
  icon?: ReactNode;
};

export default function SegmentedSwitch<T extends Primitive>({
  value,
  onChange,
  options,
  // widthClass is accepted for backwards-compat but ignored: segments now size to
  // their label so option text is always readable (no icon-only state on mobile).
  widthClass: _widthClass,
  ariaLabel,
  title,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  widthClass?: string;
  ariaLabel: string;
  title?: string;
}) {
  void _widthClass;
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const btn = btnRefs.current[idx];
      const container = containerRef.current;
      if (!btn || !container) return;
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    update();
    // Re-measure on resize (label wrapping / font load can change widths).
    window.addEventListener("resize", update);
    const t = window.setTimeout(update, 60);
    return () => {
      window.removeEventListener("resize", update);
      window.clearTimeout(t);
    };
  }, [idx, options]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex shrink-0 rounded-xl bg-bg-card-chip/35 p-1"
      role="group"
      aria-label={ariaLabel}
      title={title}
    >
      {indicator ? (
        <span
          className="absolute inset-y-1 rounded-lg bg-accent/15 ring-1 ring-inset ring-accent/40 transition-all duration-200 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
          aria-hidden="true"
        />
      ) : null}
      {options.map((x, i) => (
        <button
          key={String(x.key)}
          ref={(el) => { btnRefs.current[i] = el; }}
          type="button"
          onClick={() => onChange(x.key)}
          className={
            "relative z-10 inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs transition-colors " +
            (value === x.key ? "font-medium text-accent" : "text-text-muted hover:text-text-normal")
          }
          aria-pressed={value === x.key}
        >
          {x.icon ?? null}
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  );
}
