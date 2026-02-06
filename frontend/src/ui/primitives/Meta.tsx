import React from "react";
import { cn } from "../cn";

export function Meta({
  as: Component = "div",
  size = "xs",
  className,
  children,
}: {
  as?: keyof React.JSX.IntrinsicElements;
  size?: "xs" | "sm" | "11";
  className?: string;
  children: React.ReactNode;
}) {
  const sizeCls = size === "sm" ? "text-sm" : size === "11" ? "text-[11px]" : "text-xs";
  return <Component className={cn(sizeCls, "text-text-muted", className)}>{children}</Component>;
}

export function MetaRow({
  as: Component = "div",
  size = "xs",
  className,
  children,
}: {
  as?: keyof React.JSX.IntrinsicElements;
  size?: "xs" | "sm" | "11";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Meta as={Component} size={size} className={cn("inline-flex items-center gap-2", className)}>
      {children}
    </Meta>
  );
}

