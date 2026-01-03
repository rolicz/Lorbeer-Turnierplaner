import React from "react";
import { clamp } from "../../helpers";

export function StarsFA({
  rating,
  className = "",
  title,
  textZinc = "text-zinc-200",
}: {
  rating: number;
  className?: string;
  title?: string;
  textZinc?: string;
}) {
  const r = clamp(Number.isFinite(rating) ? rating : 0, 0, 5);
  const rounded = Math.round(r * 2) / 2; // 0.5 steps
  const full = Math.floor(rounded);
  const half = rounded - full >= 0.5;
  const empty = Math.max(0, 5 - full - (half ? 1 : 0));

  const aria = title ?? `${rounded.toFixed(1).replace(/\.0$/, "")} out of 5 stars`;

  return (
    <span className={`inline-flex items-center gap-0.5 ${textZinc} ${className}`} title={aria} aria-label={aria}>
      {Array.from({ length: full }).map((_, i) => (
        <i key={`f-${i}`} className="fa-solid fa-star" aria-hidden="true" />
      ))}
      {half && <i className="fa-solid fa-star-half-stroke" aria-hidden="true" />}
      {Array.from({ length: empty }).map((_, i) => (
        <i key={`e-${i}`} className="fa-regular fa-star" aria-hidden="true" />
      ))}
    </span>
  );
}
