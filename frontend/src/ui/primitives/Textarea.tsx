import React from "react";

/**
 * `resizable={false}` drops the native drag grabber (`DESIGN.md` §9b Q1: "a drag handle does
 * not exist under a thumb"). It is a prop rather than a class the caller passes, because
 * `resize-y` and `resize-none` are the same property at the same specificity and Tailwind emits
 * `.resize-y` *after* `.resize-none` — a `className="resize-none"` would lose, silently, and
 * only on the screen.
 */
export default function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string; resizable?: boolean }
) {
  const { label, hint, className = "", resizable = true, ...rest } = props;
  return (
    <label className="block">
      {label && <div className="input-label">{label}</div>}
      <textarea
        className={`input-field min-h-[96px] ${resizable ? "resize-y" : "resize-none"} leading-snug ${className}`}
        {...rest}
      />
      {hint && <div className="input-hint">{hint}</div>}
    </label>
  );
}

