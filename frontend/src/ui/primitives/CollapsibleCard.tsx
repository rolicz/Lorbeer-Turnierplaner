import { useState } from "react";
import { cn } from "../cn";

export default function CollapsibleCard({
  title,
  defaultOpen = true,
  right,
  children,
  className = "",
  variant = "none",
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode | ((open: boolean) => React.ReactNode);
  className?: string;
  variant?: "outer" | "inner" | "none";
}) {
  const [open, setOpen] = useState(defaultOpen);
  const variantCls =
    variant === "outer" ? "card-outer" : variant === "inner" ? "card-inner" : "";
  const pad = variant === "none" ? "px-3 py-2.5" : "";
  const bodyPad = variant === "none" ? "px-3 pb-3" : "";

  return (
    <section className={cn(variantCls, className)}>
      <button
        type="button"
        className={cn("flex w-full items-center justify-between gap-3", pad)}
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
        <div className={cn("mt-3", bodyPad)}>
          {typeof children === "function" ? children(open) : children}
        </div>
      )}
    </section>
  );
}
