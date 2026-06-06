import { useLayoutEffect, useRef, useState } from "react";

type Primitive = string | number | boolean;

export type SegmentedOption<T extends Primitive> = {
  key: T;
  label: string;
  icon?: string;
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
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label={ariaLabel}
      title={title}
    >
      {indicator ? (
        <span
          className="absolute inset-y-1 rounded-xl shadow-sm transition-all duration-200 ease-out"
          style={{
            backgroundColor: "rgb(var(--color-bg-card-inner))",
            left: indicator.left,
            width: indicator.width,
          }}
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
            "relative z-10 inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs transition-colors " +
            (value === x.key ? "text-text-normal font-medium" : "text-text-muted hover:text-text-normal")
          }
          aria-pressed={value === x.key}
        >
          {x.icon ? <i className={"fa-solid " + x.icon} aria-hidden="true" /> : null}
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  );
}
