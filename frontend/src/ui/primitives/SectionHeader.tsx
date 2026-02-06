import React from "react";
import { cn } from "../cn";

export default function SectionHeader({
  left,
  right,
  className,
  leftClassName,
  rightClassName,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  leftClassName?: string;
  rightClassName?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <div className={cn("min-w-0", leftClassName)}>{left}</div>
      {right ? <div className={cn("flex shrink-0 items-center gap-2", rightClassName)}>{right}</div> : null}
    </div>
  );
}

