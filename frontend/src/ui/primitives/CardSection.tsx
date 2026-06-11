import React from "react";
import { cn } from "../cn";

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
    <div className={cn("card-inner-flat rounded-2xl", padded && "p-3 space-y-2", className)}>
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
