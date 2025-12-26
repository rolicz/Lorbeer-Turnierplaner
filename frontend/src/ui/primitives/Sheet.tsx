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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-full md:w-[420px] md:rounded-none md:rounded-l-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold">{title}</div>
          <button className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
