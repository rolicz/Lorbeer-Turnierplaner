import React from "react";
import { cn } from "../cn";

/**
 * A titled block *inside* a card or a page section — the level-2 `inset` surface
 * of `DESIGN.md` §3 (`rounded-xl`, chip fill, hairline in the light theme).
 */
export default function CardSection({
  title,
  actions,
  padded = true,
  className,
  children,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  padded?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("inset", padded ? "space-y-2" : "p-0", className)}>
      {(title != null || actions != null) ? (
        <div className="flex items-center justify-between gap-3">
          {title != null ? <div className="min-w-0 text-sm font-semibold">{title}</div> : null}
          {actions != null ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
