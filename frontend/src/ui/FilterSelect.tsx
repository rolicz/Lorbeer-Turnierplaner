import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

import { cn } from "./cn";

export type FilterSelectOption = {
  value: string;
  label: string;
  trailing?: ReactNode;
};

/**
 * On-brand replacement for native <select> filters. Flat trigger styled like the
 * club picker; options render in a body portal so the menu never gets clipped by
 * collapsible cards / overflow ancestors and flips above when there's no room.
 */
export default function FilterSelect({
  value,
  onChange,
  options,
  disabled = false,
  leading,
  placeholder = "All",
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  disabled?: boolean;
  leading?: ReactNode;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const gap = 4;
  const placeAbove = rect ? window.innerHeight - rect.bottom < 240 && rect.top > window.innerHeight - rect.bottom : false;
  const maxH = rect
    ? Math.min(320, Math.max(160, (placeAbove ? rect.top : window.innerHeight - rect.bottom) - 12))
    : 320;

  return (
    <div className="min-w-0" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          "focus-ring flex w-full items-center gap-2 rounded-xl border bg-bg-card-chip px-3 py-2 text-left text-sm text-text-normal transition disabled:opacity-60",
          open ? "border-accent" : "border-border-card-chip",
          className,
        )}
      >
        {leading ? <span className="shrink-0 text-text-muted">{leading}</span> : null}
        <span className="min-w-0 flex-1 truncate">
          {selected ? selected.label : <span className="text-text-muted">{placeholder}</span>}
        </span>
        {selected?.trailing ? <span className="shrink-0">{selected.trailing}</span> : null}
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-text-muted transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && rect
        ? createPortal(
            <div
              ref={panelRef}
              role="listbox"
              aria-label={ariaLabel}
              className="fixed z-[60] flex flex-col overflow-y-auto overscroll-contain rounded-xl border border-border-card-chip bg-bg-card-outer py-1 shadow-pop"
              style={{
                left: rect.left,
                width: rect.width,
                maxHeight: maxH,
                ...(placeAbove ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
              }}
            >
              {options.map((o) => {
                const isSel = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => choose(o.value)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-card-chip/40"
                  >
                    <span className={cn("min-w-0 flex-1 truncate", isSel ? "text-accent" : "text-text-normal")}>
                      {o.label}
                    </span>
                    {o.trailing ? <span className="shrink-0">{o.trailing}</span> : null}
                    {isSel ? <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
