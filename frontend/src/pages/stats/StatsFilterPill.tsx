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
 * It is the *only* entry point to the filters (T4): the inline "Filters" chip S9
 * put in the sub-view chip row is gone, so the pill carries the job alone and is
 * sized for it — `h-11` with a `text-sm` mode token and 16px glyphs, a control you
 * see from across the screen that is still a capsule. It announces its state the
 * way S9 established: a solid surface with an accent hairline, an accent border +
 * halo + dot whenever a filter is off its default, and one short attention pulse
 * on the first visit to Stats in a session.
 *
 * Sections that use only one (or neither) filter hide the parts they don't
 * need; with neither, nothing is rendered at all.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, type Variants } from "framer-motion";
import { Handshake, Layers, SlidersHorizontal, Trophy, type LucideIcon } from "lucide-react";

import { ChipGroup } from "../../ui/primitives/Chip";
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

/** Defaults — anything else means the numbers on screen are filtered. */
const DEFAULT_MODE: StatsMode = "overall";
const DEFAULT_SCOPE: StatsScope = "tournaments";

/** One attention pulse per browser session, not per visit to the page. */
const PULSE_KEY = "lk:stats-filter-pulsed";

function labelOf<T extends string>(options: { key: T; label: string }[], value: T) {
  return options.find((o) => o.key === value)?.label ?? String(value);
}

/** Grows out of the pill: fade + scale from just below its resting spot. */
const popUp: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.16, ease: ease.out } },
};

/** Two short pulses; `MotionConfig reducedMotion="user"` drops the scale entirely. */
const PULSE = { scale: [1, 1.12, 1, 1.12, 1] };
const PULSE_TRANSITION = { duration: 1.1, times: [0, 0.18, 0.42, 0.6, 0.9], ease: ease.out, delay: 0.45 };

type Anchor = { top: number; right: number };

export default function StatsFilterPill({
  mode, scope, onModeChange, onScopeChange, showMode, showScope,
}: {
  mode: StatsMode; scope: StatsScope;
  onModeChange: (m: StatsMode) => void; onScopeChange: (s: StatsScope) => void;
  showMode: boolean; showScope: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // First arrival at Stats in this session: one short pulse so the pill is seen
  // once. Reading the flag is pure (safe to re-run); the effect below marks the
  // session as pulsed.
  const [pulse, setPulse] = useState(() => {
    try {
      return !sessionStorage.getItem(PULSE_KEY);
    } catch {
      return true; /* no sessionStorage (private mode): pulse this mount, that is harmless */
    }
  });

  const pillRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = pillRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Keep the same object while nothing moved, so repositioning on scroll /
    // resize doesn't re-render the popover for free.
    setAnchor((prev) => {
      const next: Anchor = { top: r.top, right: r.right };
      return prev && prev.top === next.top && prev.right === next.right ? prev : next;
    });
  }, []);

  // Anchor to the pill (same portal pattern as ui/FilterSelect.tsx) and keep the
  // anchor honest when the viewport changes (browser chrome, rotation).
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
      if (pillRef.current?.contains(t) || panelRef.current?.contains(t)) return;
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

  useEffect(() => {
    if (!pulse) return;
    try {
      sessionStorage.setItem(PULSE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [pulse]);

  // Nothing to filter (e.g. Cups): no floating clutter over the content.
  if (!showMode && !showScope) return null;

  const ScopeIcon = SCOPE_ICON[scope];
  // Only the filters this section actually uses count as "filtered".
  const filtered = (showMode && mode !== DEFAULT_MODE) || (showScope && scope !== DEFAULT_SCOPE);
  // The capsule is one control, so its values live in one label: sr-only spans
  // inside a button are concatenated without separators by the name computation.
  const values = [
    ...(showMode ? [`Mode: ${labelOf(MODE_OPTIONS, mode)}`] : []),
    ...(showScope ? [`Source: ${labelOf(SCOPE_OPTIONS, scope)}`] : []),
  ].join(", ");

  const toggle = () => {
    // place() before opening: the portal then mounts in the same commit, so the
    // focus effect finds it in the DOM.
    place();
    setPulse(false);
    setOpen((v) => !v);
  };

  /** The accent dot that marks a non-default filter. */
  const dot = filtered ? (
    <span aria-hidden="true" className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-bg-card-outer" />
  ) : null;

  return (
    <>
      <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 lg:bottom-6 lg:right-6">
        <motion.button
          ref={pillRef}
          type="button"
          onClick={toggle}
          animate={pulse ? PULSE : { scale: 1 }}
          transition={pulse ? PULSE_TRANSITION : { duration: 0.2 }}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={values}
          data-filtered={filtered ? "true" : "false"}
          data-pulse={pulse ? "true" : "false"}
          className={
            "focus-ring flex h-11 items-center gap-2.5 rounded-full border-2 bg-bg-card-outer pl-3.5 pr-4 text-text-normal shadow-pop backdrop-blur-md transition-colors " +
            (filtered ? "border-accent/70 ring-2 ring-accent/20" : "border-accent/45 hover:border-accent/70")
          }
        >
          <span className="relative inline-flex">
            <SlidersHorizontal size={16} aria-hidden="true" className={"shrink-0 " + (filtered ? "text-accent" : "text-text-muted")} />
            {dot}
          </span>
          {showMode ? (
            <span className={"text-sm font-semibold leading-none " + (showMode && mode !== DEFAULT_MODE ? "text-accent" : "")}>
              {labelOf(MODE_OPTIONS, mode)}
            </span>
          ) : null}
          {showMode && showScope ? (
            <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-border-card-chip" />
          ) : null}
          {showScope ? (
            <ScopeIcon size={16} aria-hidden="true" className={"shrink-0 " + (scope !== DEFAULT_SCOPE ? "text-accent" : "text-text-muted")} />
          ) : null}
        </motion.button>
      </div>

      {open && anchor
        ? createPortal(
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-label="Stats filters"
              variants={popUp}
              initial="hidden"
              animate="show"
              style={{
                bottom: window.innerHeight - anchor.top + 8,
                right: window.innerWidth - anchor.right,
                transformOrigin: "bottom right",
              }}
              className="card fixed z-40 w-64 space-y-3 shadow-pop backdrop-blur-md"
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
    </>
  );
}
