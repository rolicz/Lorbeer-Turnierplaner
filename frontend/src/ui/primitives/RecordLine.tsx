/* eslint-disable react-refresh/only-export-components -- `recordWidths` sizes the
   columns for a whole list and belongs next to the component that consumes them. */
/**
 * The meta line under a standings / results row: `3P  3-0-0  14:6  GD +8`.
 *
 * Why it is a component and not a template string (T14): written as flowing text with
 * `·` separators, every segment's x position depends on how many digits the segments
 * before it happen to have, so `9:4` and `15:14` push the rest of the line apart and
 * the column the eye is trying to scan zig-zags down the list.
 *
 * Here every number sits in a fixed column (`.record-num`, styles.css): the track is
 * sized by an invisible pad of N zeros, N being the digit count of the widest value in
 * *this* list (`recordWidths(rows)`), so segment k starts at the same x in every row and
 * no list is padded wider than its own data needs. `tabular-nums` makes every digit the
 * same advance, which is what makes the pad exact.
 *
 * The one segment that is **not** three tracks is `W-D-L`: it is one word, so it gets one
 * track wide enough for the widest token in the list (A7). Padding W, D and L separately
 * put each of them at the right edge of its own column and tore the hyphens off the
 * numbers to their right — "14- 5- 8".
 *
 * The `·` separators are gone from the screen — a gap between fixed columns says the same
 * thing in 8px instead of 10px per separator, and a column layout does not need them —
 * but they survive as `sr-only` text, so the line still reads as
 * "3P · 3-0-0 · 14:6 · GD +8" to a screen reader and in `textContent`.
 *
 * Widths are a required prop on purpose: a row cannot see its siblings, so only the list
 * can size the columns, and making it optional would let a call site silently go back to
 * per-row widths — exactly the bug this component exists to remove.
 */
import type { ReactNode } from "react";

/** The numbers a record line can show. Field names match the standings/stats row types. */
export type RecordValues = {
  played?: number | null;
  wins?: number | null;
  draws?: number | null;
  losses?: number | null;
  gf?: number | null;
  ga?: number | null;
  gd?: number | null;
};

/**
 * Column widths, in digits (the sign of `gd` is added on top).
 *
 * `wdl` is the digit count of the widest **whole `W-D-L` token** in the list, not of
 * one of its three numbers: the token holds a single track, because padding the three
 * numbers separately is what tore the hyphens off them ("14- 5- 8", A7).
 */
export type RecordWidths = {
  played: number;
  wdl: number;
  gf: number;
  ga: number;
  gd: number;
};

const digitsOf = (v: number | null | undefined): number =>
  v == null ? 1 : Math.max(1, Math.abs(Math.trunc(v)).toString().length);

/** Widest value per column across a list — call it once per list, pass it to every row. */
export function recordWidths(rows: readonly (RecordValues | null | undefined)[]): RecordWidths {
  // `wdl` starts at 3 — one digit per number is the narrowest a `W-D-L` token can be.
  const w: RecordWidths = { played: 1, wdl: 3, gf: 1, ga: 1, gd: 1 };
  for (const r of rows) {
    if (!r) continue;
    w.played = Math.max(w.played, digitsOf(r.played));
    w.wdl = Math.max(w.wdl, digitsOf(r.wins) + digitsOf(r.draws) + digitsOf(r.losses));
    w.gf = Math.max(w.gf, digitsOf(r.gf));
    w.ga = Math.max(w.ga, digitsOf(r.ga));
    w.gd = Math.max(w.gd, digitsOf(r.gd));
  }
  return w;
}

/**
 * A fixed-width track: an invisible `pad` string decides how wide it is, the value
 * sits in it. Every character of the pad is a tabular digit or a literal the value
 * also uses, so the pad measures exactly what the widest value in the list measures.
 */
function PadTrack({
  pad,
  align = "end",
  className,
  children,
}: {
  pad: string;
  align?: "end" | "start";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={"record-num" + (align === "start" ? " record-num-start" : "") + (className ? " " + className : "")}
      style={{ ["--record-pad" as string]: `"${pad}"` }}
    >
      {children}
    </span>
  );
}

/**
 * One numeral holding a fixed column. Exported because a few surfaces (the What-if
 * projection's points column) need the column without the rest of the line.
 */
export function RecordNum({
  digits,
  sign = false,
  align = "end",
  className,
  children,
}: {
  /** How many digits the column must hold. */
  digits: number;
  /**
   * The value carries a leading `+`/`-`. The pad gets a `+` rather than another zero,
   * because a sign is not a digit: `+` is 7.92px where a tabular digit is 7.78px, so a
   * zero would leave `+8` 0.14px wider than its own track.
   */
  sign?: boolean;
  /** `end` right-aligns the numeral in its track (the default, as in any table). */
  align?: "end" | "start";
  className?: string;
  children: ReactNode;
}) {
  return (
    <PadTrack pad={(sign ? "+" : "") + "0".repeat(Math.max(1, digits))} align={align} className={className}>
      {children}
    </PadTrack>
  );
}

/** Counts are integers; trunc so a stray float can never overflow its own track. */
const int = (v: number): number => Math.trunc(v);
const signed = (v: number): string => (int(v) >= 0 ? `+${int(v)}` : String(int(v)));

/** The separator, for screen readers and `textContent` only — see the file header. */
function Sep() {
  return <span className="sr-only"> · </span>;
}

export default function RecordLine({
  played,
  wins,
  draws,
  losses,
  gf,
  ga,
  gd,
  widths,
  playedLabel = "P",
  gdLabel = "GD",
  extra,
  className,
}: RecordValues & {
  widths: RecordWidths;
  /** Unit after the played count: `P` (default) glues on, a longer word gets a nbsp. */
  playedLabel?: string;
  gdLabel?: string;
  /** A trailing, already fixed-width value (`2.10 ppm`, `62%`). Nothing follows it. */
  extra?: ReactNode;
  className?: string;
}) {
  const hasWdl = wins != null || draws != null || losses != null;
  const segs: ReactNode[] = [];

  if (played != null) {
    segs.push(
      <span key="played" data-record-seg="played">
        <RecordNum digits={widths.played}>{int(played)}</RecordNum>
        {/* A spelled-out unit is glued to its count with a nbsp. */}
        {playedLabel.length > 1 ? "\u00a0" : ""}
        {playedLabel}
      </span>,
    );
  }
  if (hasWdl) {
    // One track for the whole token, not one per number (A7). Padding W, D and L
    // separately put each number at the right edge of its own column, which left the
    // hyphens glued to the number on their left and floating a gap away from the one
    // on their right — "14- 5- 8". `W-D-L` is one word; the slack belongs outside it,
    // in the gap that already separates the segments, and the fixed track means the
    // segments after it still start at the same x in every row (T14).
    segs.push(
      <span key="wdl" data-record-seg="wdl">
        <PadTrack pad={"0".repeat(Math.max(3, widths.wdl)) + "--"}>
          <span className="text-win">{int(wins ?? 0)}</span>
          -
          <span className="text-draw">{int(draws ?? 0)}</span>
          -
          <span className="text-loss">{int(losses ?? 0)}</span>
        </PadTrack>
      </span>,
    );
  }
  if (gf != null && ga != null) {
    segs.push(
      <span key="goals" data-record-seg="goals">
        <RecordNum digits={widths.gf}>{int(gf)}</RecordNum>
        :
        <RecordNum digits={widths.ga} align="start">{int(ga)}</RecordNum>
      </span>,
    );
  }
  if (gd != null) {
    segs.push(
      <span key="gd" data-record-seg="gd">
        {gdLabel ? <>{gdLabel}&nbsp;</> : null}
        <RecordNum digits={widths.gd} sign>{signed(gd)}</RecordNum>
      </span>,
    );
  }
  if (extra != null) {
    segs.push(
      <span key="extra" data-record-seg="extra">
        {extra}
      </span>,
    );
  }

  return (
    <span data-record-line className={"inline-flex items-baseline gap-2 tabular-nums" + (className ? " " + className : "")}>
      {segs.map((s, i) => (i === 0 ? s : [<Sep key={`sep-${i}`} />, s]))}
    </span>
  );
}
