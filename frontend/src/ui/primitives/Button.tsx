/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { cn } from "../cn";

export type ButtonVariant = "solid" | "ghost";
export type ButtonSize = "sm" | "md";

type ButtonLook = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  className?: string;
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & Omit<ButtonLook, "className"> & { className?: string };

/**
 * The button look as a class string (`DESIGN.md` §7). Use it only where a real
 * `<button>` is impossible — a react-router `<Link>`, or a decorative box that sits
 * under a native control. The `btn-*` classes live in this file and nowhere else.
 */
export function buttonClass({ variant = "solid", size, iconOnly = false, className }: ButtonLook = {}) {
  const variantCls = variant === "solid" ? "btn-solid" : "btn-ghost";
  const sizeCls =
    size === "md"
      ? "inline-flex h-9 items-center px-3"
      : size === "sm"
        ? iconOnly
          ? "inline-flex h-8 w-8 items-center justify-center p-0"
          : "inline-flex h-8 items-center px-3"
        : "";
  return cn("btn-base", variantCls, sizeCls, className);
}

export default function Button({ variant = "solid", size, iconOnly = false, className = "", ...rest }: ButtonProps) {
  return <button className={buttonClass({ variant, size, iconOnly, className })} {...rest} />;
}
