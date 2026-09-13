/**
 * Overlay dialog: the level-1 `card` surface on a scrim (`DESIGN.md` §3/§7),
 * full-screen sheet on mobile when `fullScreenOnMobile` is set.
 */
import { X } from "lucide-react";
import React, { useEffect } from "react";

import Button from "./Button";

export default function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  fullScreenOnMobile = false,
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
  /** Bottom-sheet on mobile, centered dialog on ≥sm. Default false = centered only. */
  fullScreenOnMobile?: boolean;
  /** Tailwind max-width class applied to the inner card (fullScreenOnMobile only). Default: max-w-lg. */
  maxWidth?: string;
  /** Extra classes on the inner card (fullScreenOnMobile only), e.g. "max-h-[84vh] overflow-hidden". */
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
        {subtitle && <div className="text-[11px] text-text-muted">{subtitle}</div>}
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

  if (fullScreenOnMobile) {
    const parts = ["card", "w-full p-3 sm:p-4", maxWidth ?? "max-w-lg", scrollBody && "flex flex-col", className]
      .filter(Boolean)
      .join(" ");
    return (
      <div className="fixed inset-0 z-50">
        <div className="overlay-scrim" onClick={onClose} />
        <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center p-3 sm:p-6">
          <div className={parts}>
            {header}
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="overlay-scrim" onClick={onClose} />
      <div className={["card p-4 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", scrollBody && "flex flex-col", maxWidth ?? "w-[min(92vw,520px)]"].filter(Boolean).join(" ")}>
        {header}
        {children}
      </div>
    </div>
  );
}
