import React from "react";

export default function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }
) {
  const { label, hint, className = "", ...rest } = props;
  return (
    <label className="block">
      {label && <div className="input-label">{label}</div>}
      <input
        className={`input-field ${className}`}
        {...rest}
      />
      {hint && <div className="input-hint">{hint}</div>}
    </label>
  );
}
