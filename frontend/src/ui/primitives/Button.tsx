import React from "react";

export default function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }
) {
  const { variant = "solid", className = "", ...rest } = props;
  const base = "rounded-xl px-4 py-2 text-sm font-medium transition border disabled:opacity-50 disabled:cursor-not-allowed";
  const solid = "accent-bg text-zinc-950 border-transparent hover:opacity-90";
  const ghost = "bg-transparent border-zinc-800 hover:bg-zinc-900/50";
  return <button className={`${base} ${variant === "solid" ? solid : ghost} ${className}`} {...rest} />;
}
