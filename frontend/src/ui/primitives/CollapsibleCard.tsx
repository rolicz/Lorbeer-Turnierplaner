import { useState } from "react";

export default function CollapsibleCard({
  title,
  defaultOpen = true,
  right,
  children,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="surface-card">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0 text-left">
          <div className="text-sm font-semibold">{title}</div>
        </div>

        <div className="flex items-center gap-2">
          {right}
          <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
