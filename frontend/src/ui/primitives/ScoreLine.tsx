/* eslint-disable react-refresh/only-export-components -- `scoreDigits` sizes the
   numeral columns for a whole list and belongs next to the component that consumes
   them, like `recordWidths` next to `RecordLine`. */
/**
 * The one way to render a score (`DESIGN.md` §8).
 *
 *      Flo          2 │ 1          Atzi     ← names hug the score, the trio is centred
 *                   Live · 34'              ← optional status line (hero only)
 *
 * Numerals are big, tabular and unboxed; the separator is a hairline, never a colon
 * and never a box. Never wrap this in a `chip`/`inset`/borders — the surface belongs
 * to the row or panel around it.
 *
 * **In a list, pass `digits`** (Q7). The trio is centred, so a `10` on one row and a
 * `2` on the next widen the middle cell by different amounts and the separator walks
 * left and right down the page — measured at 12–16px of drift in the friendlies list.
 * `digits` gives each numeral the fixed track `RecordLine` gives a record's columns
 * (T14): `scoreDigits(goals)` once per list, sized to that list's widest score, and
 * every separator then sits at the same x. A single score (a panel, a hero) needs
 * nothing: there is no column to keep.
 */
import type { ReactNode } from "react";

import type { MatchState } from "../../api/types";
import { cn } from "../cn";
import { RecordNum } from "./RecordLine";

export type ScoreLineSize = "hero" | "md" | "sm";
/** Result from the focus side's point of view (win / draw / loss). */
export type ScoreResult = "W" | "D" | "L";
export type ScoreSide = "left" | "right";

/** `text-4xl / text-2xl / text-lg` — the hairline separator scales with it (`h-[0.75em]`). */
const NUMERAL_CLASS: Record<ScoreLineSize, string> = {
  hero: "text-4xl",
  md: "text-2xl",
  sm: "text-lg",
};

const NAME_CLASS: Record<ScoreLineSize, string> = {
  hero: "text-lg",
  md: "text-base",
  sm: "text-sm",
};

const RESULT_TEXT: Record<ScoreResult, string> = {
  W: "text-win",
  D: "text-draw",
  L: "text-loss",
};

const RESULT_BADGE: Record<ScoreResult, string> = {
  W: "bg-win/15 text-win",
  D: "bg-draw/15 text-draw",
  L: "bg-loss/15 text-loss",
};

const RESULT_LABEL: Record<ScoreResult, string> = { W: "Win", D: "Draw", L: "Loss" };

function toLines(names: ReactNode | ReactNode[]): ReactNode[] {
  return Array.isArray(names) ? names : [names];
}

/**
 * How many digits a list's numeral columns must hold — the widest score in *this*
 * list, never wider. Call it once per list and pass the result to every row's
 * `digits`, exactly as `recordWidths` is called once per list (T14).
 */
export function scoreDigits(goals: readonly (number | null | undefined)[]): number {
  let d = 1;
  for (const g of goals) {
    if (g == null || !Number.isFinite(g)) continue;
    d = Math.max(d, Math.abs(Math.trunc(g)).toString().length);
  }
  return d;
}

function Names({
  lines,
  size,
  align,
  emphasis,
  badge,
}: {
  lines: ReactNode[];
  size: ScoreLineSize;
  align: "left" | "right";
  emphasis: string;
  /** Result badge for this side — it sits on the side's outer edge, next to the names. */
  badge?: ReactNode;
}) {
  const block = (
    <div className={cn("min-w-0", align === "right" ? "text-right" : "text-left")}>
      {lines.map((n, i) => (
        <div
          key={i}
          className={cn(
            NAME_CLASS[size],
            "break-words leading-tight md:truncate",
            emphasis,
          )}
        >
          {n}
        </div>
      ))}
    </div>
  );

  if (!badge) return block;
  return (
    <div className={cn("flex min-w-0 items-center gap-2", align === "right" ? "justify-end" : "justify-start")}>
      {align === "right" ? badge : null}
      {block}
      {align === "left" ? badge : null}
    </div>
  );
}

/**
 * The bare score numerals — big, tabular, hairline separator, no colon and no box.
 * `ScoreLine` is built from it, and so is anything else that has to *speak* a score
 * without being one (the goal entry's "which side scores" control, T3).
 */
export function ScoreNumerals({
  size = "md",
  left,
  right,
  leftClassName,
  rightClassName,
  digits,
  className,
}: {
  size?: ScoreLineSize;
  left: ReactNode;
  right: ReactNode;
  leftClassName?: string;
  rightClassName?: string;
  /** Fixed column width, in digits — `scoreDigits(list)`. See the file header. */
  digits?: number;
  className?: string;
}) {
  // Both numerals hug the hairline and the slack goes outward, so the separator —
  // the thing the eye follows down a list — is the part that cannot move.
  const track = (value: ReactNode, align: "end" | "start") =>
    digits ? (
      <RecordNum digits={digits} align={align}>
        {value}
      </RecordNum>
    ) : (
      value
    );

  return (
    <div className={cn("flex items-center justify-center gap-2 font-bold tabular-nums", NUMERAL_CLASS[size], className)}>
      <span data-score-numeral="left" className={leftClassName}>
        {track(left, "end")}
      </span>
      <span aria-hidden="true" className="h-[0.75em] w-px bg-border-card-chip/70" />
      <span data-score-numeral="right" className={rightClassName}>
        {track(right, "start")}
      </span>
    </div>
  );
}

function ResultBadge({ result }: { result: ScoreResult }) {
  return (
    <span
      data-score-result-badge={result}
      role="img"
      aria-label={RESULT_LABEL[result]}
      title={RESULT_LABEL[result]}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-micro",
        RESULT_BADGE[result],
      )}
    >
      {result}
    </span>
  );
}

export default function ScoreLine({
  size = "md",
  leftNames,
  rightNames,
  leftGoals,
  rightGoals,
  state = "finished",
  focus = null,
  result = null,
  resultBadge = false,
  status,
  digits,
  className,
}: {
  size?: ScoreLineSize;
  /** One node per player — two nodes stack (2v2). */
  leftNames: ReactNode | ReactNode[];
  rightNames: ReactNode | ReactNode[];
  leftGoals?: number | null;
  rightGoals?: number | null;
  /** `scheduled` replaces the numerals with a muted dash pair (`vs` at `sm`). */
  state?: MatchState;
  /** Which side the `result` belongs to — only that side's numeral is coloured. */
  focus?: ScoreSide | null;
  result?: ScoreResult | null;
  /** Renders a 16px W/D/L chip at the row's outer edge (dense lists). */
  resultBadge?: boolean;
  /** Hero only: a short status line under the score (`Live · 34'`). */
  status?: ReactNode;
  /** Fixed numeral columns for a list — `scoreDigits(list)`. See the file header. */
  digits?: number;
  className?: string;
}) {
  const scheduled = state === "scheduled";
  const a = leftGoals ?? 0;
  const b = rightGoals ?? 0;
  const leader: ScoreSide | null = scheduled || a === b ? null : a > b ? "left" : "right";

  const emphasis = (side: ScoreSide) =>
    leader === null
      ? "text-text-normal font-medium"
      : leader === side
        ? "text-text-normal font-semibold"
        : "text-text-muted";

  const numeralColor = (side: ScoreSide) =>
    result && focus === side ? RESULT_TEXT[result] : "text-text-normal";

  const badge = resultBadge && result ? <ResultBadge result={result} /> : null;
  // The badge belongs to the side it describes (left by default) and travels with that
  // side's names, so it stays next to them at any row width.
  const badgeSide: ScoreSide = focus ?? "left";

  return (
    <div data-score-line={size} className={cn("w-full", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <Names
          lines={toLines(leftNames)}
          size={size}
          align="right"
          emphasis={emphasis("left")}
          badge={badgeSide === "left" ? badge : null}
        />

        {scheduled && size === "sm" ? (
          <div
            className={cn(
              "flex items-center justify-center gap-2 justify-self-center font-bold tabular-nums",
              NUMERAL_CLASS[size],
            )}
          >
            <span className="text-sm font-medium text-text-muted">vs</span>
          </div>
        ) : (
          <ScoreNumerals
            size={size}
            className="justify-self-center"
            digits={digits}
            left={scheduled ? "–" : a}
            right={scheduled ? "–" : b}
            leftClassName={scheduled ? "text-text-muted" : numeralColor("left")}
            rightClassName={scheduled ? "text-text-muted" : numeralColor("right")}
          />
        )}

        <Names
          lines={toLines(rightNames)}
          size={size}
          align="left"
          emphasis={emphasis("right")}
          badge={badgeSide === "right" ? badge : null}
        />
      </div>

      {size === "hero" && status ? (
        <div className="mt-1 text-center text-xs text-text-muted">{status}</div>
      ) : null}
    </div>
  );
}
