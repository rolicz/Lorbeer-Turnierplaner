/**
 * One side's club, as a single 16px symbol (`DESIGN.md` §8).
 *
 *      Flo 🛡  2 │ 1  🛡 Atzi       ← the mark rides the inner edge of its names
 *
 * It is what a **score-only** match row says about the clubs: a row that already
 * carries a club line (`MatchSides`, the Details half of any match list) gets no
 * mark, because one club never wears two symbols on one row. Passed to
 * `ScoreLine` as `leftMark` / `rightMark`, which hangs it off the names' inner
 * edge at `gap-1.5` against the grid's `gap-3` to the numerals.
 *
 * Two details are load-bearing and neither is decoration:
 *
 * - **A clubless side keeps the slot.** Returning `null` would let that row's
 *   names sit 22px closer to the score than every other row's, and the name
 *   column would break into two x values (measured, Q8). The empty box is
 *   `aria-hidden` and says nothing — the dense view spends no symbol on the
 *   absence of a club.
 * - **The symbol carries the club's name to screen readers.** `ClubBadge` is
 *   `aria-hidden` by design, and in a score-only row the symbol is the entire
 *   statement about the clubs, so an `sr-only` name sits next to it. A `title`
 *   tooltip is not an option: the row content is `pointer-events-none` under a
 *   stretched link/button (§7), so it would work for a reader and not for an
 *   editor.
 *
 * Q8 built this inside the friendlies list; Q17 moved it here when the stats
 * match lists and Records needed the same answer.
 */
import type { Club } from "../../api/types";
import ClubBadge from "../ClubBadge";
import { clubLabelPartsById } from "../clubControls";

export default function ClubMark({
  clubs,
  clubId,
  side,
}: {
  clubs: Club[];
  clubId?: number | null;
  /** Written to `data-club-mark` only — tests and measurement, no paint. */
  side?: "left" | "right";
}) {
  const has = clubs.some((c) => c.id === clubId);
  if (!has) return <span aria-hidden="true" data-club-mark={side} className="h-4 w-4 shrink-0" />;

  const parts = clubLabelPartsById(clubs, clubId);
  return (
    <span data-club-mark={side} className="inline-flex shrink-0 items-center">
      <ClubBadge
        name={parts.name}
        nation={parts.national_nation}
        clubId={parts.id}
        crestVersion={parts.crest_updated_at}
        size="sm"
      />
      <span className="sr-only">{parts.name}</span>
    </span>
  );
}
