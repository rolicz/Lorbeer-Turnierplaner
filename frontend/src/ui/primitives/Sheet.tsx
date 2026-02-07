import React, { useEffect } from "react";

/**
 * Mobile-friendly bottom sheet.
 * On desktop, it behaves like a right-side drawer.
 */
export default function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="overlay-scrim" onClick={onClose} />
      <div className="sheet-shell absolute bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-full md:w-[420px] md:rounded-none md:rounded-l-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold">{title}</div>
          <button
            className="icon-button h-10 w-10 p-0 inline-flex items-center justify-center"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            type="button"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
