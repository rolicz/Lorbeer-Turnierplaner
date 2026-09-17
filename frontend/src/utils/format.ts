/** Shared date/number formatting utilities. Import from here instead of defining locally. */

// Roli, 2026-09-17: a date must read the same on every phone, so nothing passes `undefined`.
// Numbers are Austrian; spelled-out and abbreviated months are English, because the UI is
// English and "März 2026" in it is a bug, not a feature. en-GB (not en-US) so the spelled
// form stays day-first and agrees with the numeric one.
export const APP_LOCALE_NUMERIC = "de-AT";
export const APP_LOCALE_MONTHS = "en-GB";

export function fmtDate(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(d + (d.includes("T") ? "" : "T00:00:00"));
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString(APP_LOCALE_NUMERIC, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * The spelled-out date — "15 September 2026" — for a heading that *is* a date
 * (the friendlies list's day groups, Q7). The numeric `fmtDate` stays the form
 * for a date pill, where it is a fixed-width token next to other tokens.
 */
export function fmtDateLong(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(d + (d.includes("T") ? "" : "T00:00:00"));
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString(APP_LOCALE_MONTHS, { day: "numeric", month: "long", year: "numeric" });
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(APP_LOCALE_NUMERIC, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format a JS timestamp (ms) as a compact locale datetime string. */
export function fmtTs(ms: number): string {
  return new Date(ms).toLocaleString(APP_LOCALE_NUMERIC, {
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

/**
 * A count with a unit that agrees with it — "1 match", "6 matches" (A7). Both forms
 * are spelled out: English does not derive one from the other reliably ("match" →
 * "matches", "game" → "games"), and a caller reading the call site should see both.
 */
export function fmtCount(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
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

/** "12 Sept 2026" style — used for streak date ranges and match history meta. */
export function fmtShortDate(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(APP_LOCALE_MONTHS, { day: "2-digit", month: "short", year: "numeric" });
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
