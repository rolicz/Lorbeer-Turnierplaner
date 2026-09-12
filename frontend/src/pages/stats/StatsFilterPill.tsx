/**
 * The two global stats filters (Mode and Source) as one compact floating pill.
 *
 * The pill itself is tiny and icon-forward (DESIGN.md §9): a sliders glyph, the
 * mode as a short token ("All" / "1v1" / "2v2") and the source as an icon.
 * Tapping it opens an anchored popover with the same chip groups the rest of the
 * app uses, so the filters read like the app and not like a form. It floats in
 * the bottom-right corner — above the mobile bottom tab bar, using the same
 * offset as the error toast — so the filters stay reachable while scrolled down.
 *
 * Sections that use only one (or neither) filter hide the parts they don't
 * need; with neither, nothing is rendered at all.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, type Variants } from "framer-motion";
import { Handshake, Layers, SlidersHorizontal, Trophy, type LucideIcon } from "lucide-react";

import { ChipGroup } from "./charts";
import { ease } from "../../ui/motion/motion";
import type { StatsMode } from "./statsMode";
import type { StatsScope } from "../../api/types";

/** "overall" reads as "All" in the UI; the URL value stays `overall`. */
const MODE_OPTIONS: { key: StatsMode; label: string }[] = [
  { key: "overall", label: "All" },
  { key: "1v1", label: "1v1" },
  { key: "2v2", label: "2v2" },
];

const SCOPE_OPTIONS: { key: StatsScope; label: string }[] = [
  { key: "tournaments", label: "Tournaments" },
  { key: "both", label: "Both" },
  { key: "friendlies", label: "Friendlies" },
];

const SCOPE_ICON: Record<StatsScope, LucideIcon> = {
  tournaments: Trophy,
  both: Layers,
  friendlies: Handshake,
};

function labelOf<T extends string>(options: { key: T; label: string }[], value: T) {
  return options.find((o) => o.key === value)?.label ?? String(value);
}

/** Grows out of the pill: fade + scale from just below its resting spot. */
const popUp: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.16, ease: ease.out } },
};

export default function StatsFilterPill({
  mode, scope, onModeChange, onScopeChange, showMode, showScope,
}: {
  mode: StatsMode; scope: StatsScope;
  onModeChange: (m: StatsMode) => void; onScopeChange: (s: StatsScope) => void;
  showMode: boolean; showScope: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = pillRef.current;
    if (!el) return;
    const next = el.getBoundingClientRect();
    // Keep the same object while nothing moved, so repositioning on scroll /
    // resize doesn't re-render the popover for free.
    setRect((prev) => (prev && prev.top === next.top && prev.right === next.right ? prev : next));
  }, []);

  // Anchor to the pill (same portal pattern as ui/FilterSelect.tsx) and keep the
  // anchor honest when the viewport changes (mobile browser chrome, rotation).
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, place]);

  // Move focus into the popover so keyboard users land on the chips.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>("button"));
    (buttons.find((b) => b.getAttribute("aria-pressed") === "true") ?? buttons[0])?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // The pill toggles itself on click; ignoring it here keeps re-tap = close.
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      pillRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing to filter (e.g. Cups): no floating clutter over the content.
  if (!showMode && !showScope) return null;

  const ScopeIcon = SCOPE_ICON[scope];
  // The capsule is one control, so its values live in one label: sr-only spans
  // inside a button are concatenated without separators by the name computation.
  const pillLabel = [
    ...(showMode ? [`Mode: ${labelOf(MODE_OPTIONS, mode)}`] : []),
    ...(showScope ? [`Source: ${labelOf(SCOPE_OPTIONS, scope)}`] : []),
  ].join(", ");

  return (
    <div
      ref={rootRef}
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 lg:bottom-6 lg:right-6"
    >
      {/* place() before opening: the popover then mounts in the same commit, so
          the focus effect finds it in the DOM. */}
      <button
        ref={pillRef}
        type="button"
        onClick={() => { place(); setOpen((v) => !v); }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={pillLabel}
        className="focus-ring flex h-9 items-center gap-2 rounded-full border border-border-card-chip/60 bg-bg-card-outer/85 pl-2.5 pr-3 text-text-normal shadow-pop backdrop-blur-md transition-colors hover:bg-bg-card-outer"
      >
        <SlidersHorizontal size={14} aria-hidden="true" className="shrink-0 text-text-muted" />
        {showMode ? (
          <span className="text-xs font-semibold leading-none">{labelOf(MODE_OPTIONS, mode)}</span>
        ) : null}
        {showMode && showScope ? (
          <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-border-card-chip" />
        ) : null}
        {showScope ? (
          <ScopeIcon size={14} aria-hidden="true" className="shrink-0 text-text-muted" />
        ) : null}
      </button>

      {open && rect
        ? createPortal(
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-label="Stats filters"
              variants={popUp}
              initial="hidden"
              animate="show"
              style={{
                bottom: window.innerHeight - rect.top + 8,
                right: window.innerWidth - rect.right,
                transformOrigin: "bottom right",
              }}
              className="card-outer fixed z-40 w-64 space-y-3 shadow-pop backdrop-blur-md"
            >
              {showMode ? (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-text-muted">Mode</div>
                  <ChipGroup<StatsMode> value={mode} onChange={onModeChange} options={MODE_OPTIONS} ariaLabel="Mode" />
                </div>
              ) : null}
              {showScope ? (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-text-muted">Source</div>
                  <ChipGroup<StatsScope> value={scope} onChange={onScopeChange} options={SCOPE_OPTIONS} ariaLabel="Source" />
                </div>
              ) : null}
            </motion.div>,
            document.body,
          )
        : null}
    </div>
  );
}
