import React from "react";

export default function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }
) {
  const { label, hint, className = "", ...rest } = props;
  return (
    <label className="block">
      {label && <div className="mb-1 text-xs text-zinc-400">{label}</div>}
      <input
        className={`w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600 ${className}`}
        {...rest}
      />
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </label>
  );
}
