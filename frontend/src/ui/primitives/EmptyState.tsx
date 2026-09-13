import React from "react";
import { cn } from "../cn";

export default function EmptyState({ title, hint, className }: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-center text-sm text-text-muted", className)}>
      <div>{title}</div>
      {hint != null ? <div className="mt-1 text-xs opacity-75">{hint}</div> : null}
    </div>
  );
}
