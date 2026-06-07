import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, Check, X } from "lucide-react";

import type { Club } from "../api/types";
import { StarsFA } from "./primitives/StarsFA";
import { starsLabel } from "./clubControls";
import { cn } from "./cn";

/**
 * Searchable, on-brand club picker. Replaces the native <select> club dropdowns.
 * The list renders in a body portal (fixed positioning) so it never gets clipped
 * by collapsible cards / overflow-hidden ancestors, and flips above when needed.
 */
export default function ClubCombobox({
  label,
  value,
  onChange,
  disabled = false,
  clubs,
  placeholder = "Select club…",
}: {
  label?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  clubs: Club[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = useMemo(() => clubs.find((c) => c.id === value) ?? null, [clubs, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clubs;
    return clubs.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.league_name ?? "").toLowerCase().includes(q),
    );
  }, [clubs, query]);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  // Position + keep positioned while scrolling/resizing.
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

  // Focus the search field when the menu opens (reset happens in `toggle`).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  // Outside-click / Escape (accounts for the portalled panel).
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

  // Highlight clamped to the current filtered length (derived, not stored), so
  // shrinking the list as you type never leaves the highlight out of range.
  const activeClamped = Math.min(activeIdx, Math.max(0, filtered.length - 1));
  useEffect(() => {
    if (!open) return;
    const opt = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[activeClamped];
    opt?.scrollIntoView({ block: "nearest" });
  }, [activeClamped, open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setQuery("");
    setActiveIdx(0);
    setOpen(true);
  };

  const choose = (cid: number | null) => {
    onChange(cid);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(Math.min(activeClamped + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(Math.max(activeClamped - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[activeClamped];
      if (c) choose(c.id);
    }
  };

  // Placement: flip above when there isn't room below.
  const gap = 4;
  const placeAbove = rect ? window.innerHeight - rect.bottom < 260 && rect.top > window.innerHeight - rect.bottom : false;
  const maxH = rect
    ? Math.min(360, Math.max(160, (placeAbove ? rect.top : window.innerHeight - rect.bottom) - 12))
    : 360;

  return (
    <div className="min-w-0" ref={rootRef}>
      {label ? <div className="input-label">{label}</div> : null}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border bg-bg-card-chip px-3 py-2 text-left text-sm text-text-normal transition focus-ring disabled:opacity-60",
          open ? "border-accent" : "border-border-card-chip",
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? selected.name : <span className="text-text-muted">{placeholder}</span>}
        </span>
        {selected ? (
          <span className="shrink-0 text-xs tabular-nums text-text-muted">{starsLabel(selected.star_rating)}★</span>
        ) : null}
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-text-muted transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && rect
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-border-card-chip bg-bg-card-outer shadow-pop"
              style={{
                left: rect.left,
                width: rect.width,
                maxHeight: maxH,
                ...(placeAbove
                  ? { bottom: window.innerHeight - rect.top + gap }
                  : { top: rect.bottom + gap }),
              }}
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-border-card-chip/50 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Search clubs…"
                  className="w-full bg-transparent text-sm text-text-normal outline-none placeholder:text-text-muted"
                  aria-controls={listId}
                  aria-autocomplete="list"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="shrink-0 text-text-muted hover:text-text-normal"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div ref={listRef} id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
                {value != null ? (
                  <button
                    type="button"
                    onClick={() => choose(null)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-bg-card-chip/40"
                  >
                    <X className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Clear selection
                  </button>
                ) : null}

                {filtered.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-text-muted">No clubs found</div>
                ) : (
                  filtered.map((c, i) => {
                    const isSel = c.id === value;
                    const isActive = i === activeClamped;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => choose(c.id)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                          isActive ? "bg-bg-card-chip/60" : "hover:bg-bg-card-chip/40",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate", isSel ? "text-accent" : "text-text-normal")}>{c.name}</span>
                          {c.league_name ? (
                            <span className="block truncate text-[11px] text-text-muted">{c.league_name}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0">
                          <StarsFA rating={Number(c.star_rating) || 0} textClassName="text-text-muted" />
                        </span>
                        {isSel ? <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" /> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
