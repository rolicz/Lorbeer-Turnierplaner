/**
 * Overlay dialog: the level-1 `card` surface on a scrim (`DESIGN.md` §3/§7),
 * a bottom sheet on mobile and centered on `sm` and up — the only layout.
 *
 * Safe area (Q4): the sheet is `fixed`, so it escapes the `body` padding that keeps the
 * page clear of a landscape notch, and its bottom edge would otherwise land in the home
 * indicator strip. The *positioning* box takes the insets (`bottom-safe-b left-safe-l
 * right-safe-r`, plus `sm:top-safe-t` once it centres) and the card keeps its own `p-3`
 * on top — the container owns the inset, the surface owns its padding. `env()` is 0px
 * where there is no inset, so nothing moves on Android, desktop or an older iPhone.
 */
import { X } from "lucide-react";
import React, { useEffect } from "react";

import Button from "./Button";

/**
 * An overlay root takes no flow spacing: a page column is `.page`/`space-y-*`, whose
 * `> * ~ *` rule would hand this `fixed inset-0` box a 12px top margin and shrink it to
 * 832px on a 844px screen — the scrim then misses the top 12px of the screen. A class
 * cannot say this (`.page > :not([hidden]) ~ :not([hidden])` outranks `mt-0`), so it is
 * an inline style. Measured before the fix: root 12..844; after: 0..844.
 */
const OVERLAY_ROOT_STYLE: React.CSSProperties = { margin: 0 };

export default function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  maxWidth,
  scrollBody = false,
  className,
}: {
  open: boolean;
  /** String → auto-styled as text-sm font-semibold; ReactNode → rendered as-is in the title wrapper. */
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** Tailwind max-width class applied to the inner card. Default: max-w-lg. */
  maxWidth?: string;
  /** Extra classes on the inner card, e.g. "max-h-[84vh] overflow-hidden". */
  className?: string;
  /**
   * Lay the card out as a flex column (the header is shrink-0) so a child marked
   * `flex-1 min-h-0 overflow-y-auto` scrolls within the card's max-height — no `calc(vh-rem)`
   * guesswork about the header height. Pair with a `max-h-[..] overflow-hidden` class on the card.
   */
  scrollBody?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const titleEl = typeof title === "string"
    ? <div className="truncate text-sm font-semibold text-text-normal">{title}</div>
    : title;

  const header = (
    <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
      <div className="min-w-0">
        {titleEl}
        {subtitle && <div className="text-xs text-text-muted">{subtitle}</div>}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
        onClick={onClose}
        aria-label="Close"
        title="Close"
      >
        <X size={16} aria-hidden="true" />
      </Button>
    </div>
  );

  // A sheet never grows past the safe box: `scrollBody` cards bring their own max-height
  // and scroll a child, the rest are clamped here and scroll themselves — otherwise a tall
  // dialog's buttons end up off-screen (measured in landscape, 844x390: the avatar editor's
  // row sat 99px below the viewport).
  const parts = [
    "card w-full p-3 sm:p-4",
    maxWidth ?? "max-w-lg",
    scrollBody ? "flex flex-col" : "max-h-sheet sm:max-h-sheet-sm overflow-y-auto",
    className,
  ].filter(Boolean).join(" ");
  return (
    <div className="fixed inset-0 z-50" style={OVERLAY_ROOT_STYLE}>
      <div className="overlay-scrim" onClick={onClose} />
      <div className="absolute bottom-safe-b left-safe-l right-safe-r sm:top-safe-t sm:flex sm:items-center sm:justify-center p-3 sm:p-6">
        <div className={parts}>
          {header}
          {children}
        </div>
      </div>
    </div>
  );
}
