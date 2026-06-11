/** Shared date/number formatting utilities. Import from here instead of defining locally. */

export function fmtDate(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(d + (d.includes("T") ? "" : "T00:00:00"));
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString();
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format a JS timestamp (ms) as a compact locale datetime string. */
export function fmtTs(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** MM/YY label for chart month ticks. */
export function fmtMonthDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${yy}`;
}

export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Math.trunc(n));
}

export function fmtAvg(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

export function fmtOdd(x: number): string {
  return Number.isFinite(x) ? x.toFixed(2) : "—";
}

/** Re-exported from helpers.ts for co-location with other math utilities. */
export { clamp } from "../helpers";

/**
 * Split a string at a word boundary so that neither half exceeds maxLen.
 * Returns [firstLine, secondLine].
 */
export function wrapTwoLinesWords(s: string, maxLen: number): readonly [string, string] {
  const raw = String(s ?? "").trim();
  if (!raw) return ["", ""] as const;
  if (raw.length <= maxLen) return [raw, ""] as const;

  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [raw, ""] as const;

  let best: { i: number; score: number } | null = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const over = Math.max(0, a.length - maxLen) + Math.max(0, b.length - maxLen);
    const balance = Math.abs(a.length - b.length);
    const score = Math.max(a.length, b.length) + balance * 0.25 + over * 2;
    if (!best || score < best.score) best = { i, score };
  }

  const i = best?.i ?? Math.ceil(words.length / 2);
  return [words.slice(0, i).join(" "), words.slice(i).join(" ")] as const;
}

export function parseDateSafe(s?: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** "12 Jun '26" style — used for streak date ranges and match history meta. */
export function fmtShortDate(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" });
}

/** Round an ELO/rating to the nearest integer. Returns "—" for non-finite values. */
export function fmtRating(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return String(Math.round(x));
}

/** Format a ranking as "#pos/total" (e.g. "#3/8"). Uses "?" when total is null. */
export function fmtRank(pos: number, total: number | null): string {
  return `#${pos}/${total ?? "?"}`;
}
