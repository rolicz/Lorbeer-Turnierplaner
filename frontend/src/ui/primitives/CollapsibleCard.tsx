import { useState } from "react";

export default function CollapsibleCard({
  title,
  defaultOpen = true,
  right,
  children,
  className = "",
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`${className}`}>
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
          <span className="text-subtle">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && (
        <div className="px-1 pb-1">
          {children}
        </div>
      )}
    </div>
  );
}
