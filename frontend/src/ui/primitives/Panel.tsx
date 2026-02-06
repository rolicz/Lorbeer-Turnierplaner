import React from "react";
import { cn } from "../cn";

export default function Panel({
  variant = "default",
  className,
  children,
}: {
  variant?: "default" | "subtle";
  className?: string;
  children: React.ReactNode;
}) {
  const base = variant === "subtle" ? "panel-subtle" : "panel";
  return <div className={cn(base, className)}>{children}</div>;
}

