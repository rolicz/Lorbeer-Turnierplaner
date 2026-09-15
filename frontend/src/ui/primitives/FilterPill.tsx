/* eslint-disable react-refresh/only-export-components -- `filterGroup` builds the
   descriptor this component consumes and belongs next to it, like `recordWidths`
   next to `RecordLine`. */
/**
 * The app's floating filter control (`DESIGN.md` §9).
 *
 * One capsule in the bottom-right corner, `h-11` and icon-forward: a sliders glyph
 * plus one short token per group — the mode as text, the source or the view as an
 * icon. Tapping it opens an anchored popover with a `ChipGroup` per group, so the
 * filters read like the app and not like a form. It is the **only** entry point a
 * page's filters have (T4): no inline chip row, no second trigger.
 *
 * It was the stats page's pill until Q7. Nothing in here knows what a "mode" or a
 * "source" is any more: a page declares its groups (`filterGroup`), owns their
 * state, and this component owns the capsule, the popover, the placement, the
 * outside/Escape close, the scroll tuck and the one-per-session pulse.
 *
 * A group is either a **filter** (it changes which rows the page shows) or a
 * **display** preference (`display: true` — Compact/Details). Only a filter that
 * is off its default turns the pill accent: the accent state means "what you are
 * looking at is filtered", and choosing a denser row filters nothing.
 *
 * With no groups at all nothing is rendered — a section that filters nothing gets
 * no floating clutter over its content.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, type Variants } from "framer-motion";
import { SlidersHorizontal, type LucideIcon } from "lucide-react";

import { ChipGroup } from "./Chip";
import { ease } from "../motion/motion";

export type FilterPillOption = {
  key: string;
  label: string;
  /** Shown in the capsule when this option is current, for a group whose token is an icon. */
  icon?: LucideIcon;
};

export type FilterPillGroup = {
  /** Names the group in the popover and in the pill's own label ("Mode", "Source", "View"). */
  label: string;
  value: string;
  options: readonly FilterPillOption[];
  onChange: (value: string) => void;
  /** The value that means "nothing is filtered here". */
  defaultValue: string;
  /** How the current value shows in the capsule. */
  token: "text" | "icon";
  /** A display preference, not a filter: it never turns the pill accent (see above). */
  display?: boolean;
};

/**
 * Builds a group from a page's own union type. The single cast lives here: the pill
 * hands back nothing but a key it was given, so widening `T` to `string` is safe —
 * and doing it once keeps every call site free of casts.
 */
export function filterGroup<T extends string>(g: {
  label: string;
  value: T;
  options: readonly { key: T; label: string; icon?: LucideIcon }[];
  onChange: (value: T) => void;
  defaultValue: T;
  token: "text" | "icon";
  display?: boolean;
}): FilterPillGroup {
  return g as unknown as FilterPillGroup;
}

function currentOption(g: FilterPillGroup): FilterPillOption | undefined {
  return g.options.find((o) => o.key === g.value);
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

export default function FilterPill({
  groups,
  ariaLabel,
  pulseKey,
}: {
  /** Only the groups this section actually uses; none at all renders nothing. */
  groups: readonly FilterPillGroup[];
  /** Names the popover ("Stats filters", "Friendlies filters"). */
  ariaLabel: string;
  /** One attention pulse per browser session per surface. */
  pulseKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // First arrival at this surface in this session: one short pulse so the pill is
  // seen once. Reading the flag is pure (safe to re-run); the effect below marks
  // the session as pulsed.
  const [pulse, setPulse] = useState(() => {
    try {
      return !sessionStorage.getItem(pulseKey);
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
      sessionStorage.setItem(pulseKey, "1");
    } catch {
      /* ignore */
    }
  }, [pulse, pulseKey]);

  // Scrolling forward tucks it away (A7). A floating capsule in the bottom-right
  // corner sits on top of exactly the column a list right-aligns its numbers in —
  // Positions' last player, a streak's value, the matchup's records — and on a
  // phone there is nowhere else for it to go. So it rides the scroll the way a
  // hiding app bar does: gone while you scroll *down* into content, back on any
  // upward scroll, at the top of the page, at the very bottom (where the page
  // already reserves its gutter, DESIGN.md §9) and whenever it is focused or open.
  const [scrolledAway, setScrolledAway] = useState(false);
  const tucked = scrolledAway && !open;
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      // Open, the popover is anchored to the pill and follows it: never tuck.
      if (open) return;
      const y = window.scrollY;
      const dy = y - last;
      if (Math.abs(dy) < 6) return;
      last = y;
      if (pillRef.current?.contains(document.activeElement)) {
        setScrolledAway(false);
        return;
      }
      const atBottom = y + window.innerHeight >= document.documentElement.scrollHeight - 4;
      setScrolledAway(dy > 0 && y > 120 && !atBottom);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  // Nothing to filter (e.g. the Cups sub-view): no floating clutter over the content.
  if (!groups.length) return null;

  // Only a real filter off its default counts — a display preference never does.
  const filtered = groups.some((g) => !g.display && g.value !== g.defaultValue);
  // The capsule is one control, so its values live in one label: sr-only spans
  // inside a button are concatenated without separators by the name computation.
  const values = groups.map((g) => `${g.label}: ${currentOption(g)?.label ?? g.value}`).join(", ");

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

  const tokens: ReactNode[] = [];
  groups.forEach((g, i) => {
    const option = currentOption(g);
    // A display group is never accent: the accent says "filtered", and it is not.
    const accent = !g.display && g.value !== g.defaultValue;
    if (i > 0) {
      tokens.push(
        <span key={`sep-${g.label}`} aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-border-card-chip" />,
      );
    }
    if (g.token === "text") {
      tokens.push(
        <span key={g.label} className={"text-sm font-semibold leading-none " + (accent ? "text-accent" : "")}>
          {option?.label ?? g.value}
        </span>,
      );
      return;
    }
    const Icon = option?.icon;
    tokens.push(
      Icon ? (
        <Icon key={g.label} size={16} aria-hidden="true" className={"shrink-0 " + (accent ? "text-accent" : "text-text-muted")} />
      ) : (
        <span key={g.label} className={"text-sm font-semibold leading-none " + (accent ? "text-accent" : "")}>
          {option?.label ?? g.value}
        </span>
      ),
    );
  });

  return (
    <>
      <div
        data-tucked={tucked ? "true" : "false"}
        className={
          "fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 transition duration-200 motion-reduce:transition-none lg:bottom-6 lg:right-6 " +
          (tucked ? "translate-y-32 opacity-0" : "translate-y-0 opacity-100")
        }
      >
        <motion.button
          ref={pillRef}
          type="button"
          onClick={toggle}
          onFocus={() => setScrolledAway(false)}
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
          {tokens}
        </motion.button>
      </div>

      {open && anchor
        ? createPortal(
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-label={ariaLabel}
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
              {groups.map((g) => (
                <div key={g.label} className="space-y-1.5">
                  <div className="text-xs font-medium text-text-muted">{g.label}</div>
                  <ChipGroup<string>
                    value={g.value}
                    onChange={g.onChange}
                    options={g.options.map((o) => ({ key: o.key, label: o.label }))}
                    ariaLabel={g.label}
                  />
                </div>
              ))}
            </motion.div>,
            document.body,
          )
        : null}
    </>
  );
}
