import React from "react";

export default function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }
) {
  const { variant = "solid", className = "", ...rest } = props;
  const base = "btn-base";
  const solid = "btn-solid";
  const ghost = "btn-ghost";
  return <button className={`${base} ${variant === "solid" ? solid : ghost} ${className}`} {...rest} />;
}
