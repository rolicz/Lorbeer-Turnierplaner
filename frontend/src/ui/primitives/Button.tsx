import React from "react";
import { cn } from "../cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "ghost";
  size?: "sm" | "md";
  iconOnly?: boolean;
};

export default function Button({ variant = "solid", size, iconOnly = false, className = "", ...rest }: ButtonProps) {
  const variantCls = variant === "solid" ? "btn-solid" : "btn-ghost";
  const sizeCls =
    size === "md"
      ? "inline-flex h-9 items-center px-3"
      : size === "sm"
        ? iconOnly
          ? "inline-flex h-8 w-8 items-center justify-center p-0"
          : "inline-flex h-8 items-center px-3"
        : "";
  return <button className={cn("btn-base", variantCls, sizeCls, className)} {...rest} />;
}
