import React from "react";
import { cn } from "../cn";

export default function Card({
  title,
  right,
  children,
  className = "",
  variant = "none",
  bodyClassName = "",
  showHeader = true,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  variant?: "outer" | "inner" | "none";
  bodyClassName?: string;
  showHeader?: boolean;
}) {
  const variantCls =
    variant === "outer" ? "card-outer" : variant === "inner" ? "card-inner" : "";
  const hasHeader = showHeader && title != null && title !== "";

  return (
    <section className={cn(variantCls, className)}>
      {hasHeader ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      ) : null}

      <div className={cn(hasHeader ? "mt-3" : "", bodyClassName)}>{children}</div>
    </section>
  );
}
