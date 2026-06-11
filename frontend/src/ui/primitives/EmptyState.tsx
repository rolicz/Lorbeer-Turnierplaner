import React from "react";
import { cn } from "../cn";

export default function EmptyState({ icon, title, hint, className }: {
  icon?: string;
  title: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-center text-sm text-text-muted", className)}>
      {icon != null ? <i className={cn(icon, "mb-2 block opacity-60")} aria-hidden="true" /> : null}
      <div>{title}</div>
      {hint != null ? <div className="mt-1 text-[11px] opacity-75">{hint}</div> : null}
    </div>
  );
}
