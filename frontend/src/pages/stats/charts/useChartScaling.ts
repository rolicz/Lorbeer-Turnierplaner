import { clamp } from "../../../utils/format";

/** Map a data value to a y SVG coordinate in a fixed viewBox. */
export function yAtScale(v: number, yMax: number, h: number, padT: number, padB: number): number {
  const vv = Math.max(0, Math.min(yMax, v));
  const innerH = h - padT - padB;
  return padT + (1 - vv / Math.max(1e-6, yMax)) * innerH;
}

/**
 * Map a timestamp to an x SVG coordinate.
 * Does NOT clamp to window edges — lines naturally enter/exit during pan/zoom.
 * Safety-clamps extreme values to keep SVG coords in a sane range.
 */
export function xAtScale(ts: number, windowStartTs: number, span: number, padL: number, padR: number, w: number): number {
  const p = (ts - windowStartTs) / span;
  const pp = clamp(p, -2.5, 3.5);
  return padL + pp * (w - padL - padR);
}
