import React from "react";

export default function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }
) {
  const { label, hint, className = "", ...rest } = props;
  return (
    <label className="block">
      {label && <div className="input-label">{label}</div>}
      <textarea
        className={`input-field min-h-[96px] resize-y leading-snug ${className}`}
        {...rest}
      />
      {hint && <div className="input-hint">{hint}</div>}
    </label>
  );
}

