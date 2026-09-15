/* eslint-disable react-refresh/only-export-components -- `groupFriendliesByDate`
   is this list's own shaping step and belongs next to the list that consumes it. */
/**
 * The friendlies list: the matches of one day, grouped by day (Q7).
 *
 * It used to be `pages/stats/MatchHistoryList` fed a **fake tournament per date** —
 * `{ name: "Friendlies", date, status: "friendly" }` — which is why every group on
 * this page was titled with the page's own name and why the thing that actually
 * names a group, its date, was demoted to a chip underneath. That component is
 * written for matches grouped by *tournament* and is right for the four surfaces
 * that really do mix tournaments and friendlies (a profile's history, the H2H
 * matchup); it is not right for a page where every group is a friendly. So this
 * page has a list of its own, and the fake tournament is gone.
 *
 *   15 SEPTEMBER 2026 ──────────────────────────────  4 matches
 *              Roli   9 │ 1   Flo
 *      Rangers F.C. 🛡   │   🛡 Heart of Midlothian F.C.
 *   Scottish Premiership 🏴 ★3.5 │ 3.5★ 🏴 Scottish Premiership
 *
 * Two rules hold the layout together:
 *
 * - **Every score sits at the same x**, down the whole page and across both views —
 *   `scoreDigits` sizes the numeral columns once for the entire list, so a `12`
 *   cannot push the hairline off the column a `2` set (`ScoreLine`, the mechanism
 *   T14 gave `RecordLine`).
 * - **The row is the only control.** Tapping it opens the friendly's editor
 *   underneath it; the edit and delete buttons that used to sit on every row are
 *   gone, and delete lives inside the editor (`DESIGN.md` §7 stretched overlay,
 *   §9b "an editor a row opens belongs under the row").
 */
import type { ReactNode } from "react";

import MatchSides from "../../ui/primitives/MatchSides";
import ScoreLine, { scoreDigits } from "../../ui/primitives/ScoreLine";
import type { Club, MatchState } from "../../api/types";
import type { FriendlyMatchResponse } from "../../api/friendlies.api";
import { fmtCount, fmtDateLong } from "../../utils/format";

export type FriendlyDayGroup = { dateKey: string; rows: FriendlyMatchResponse[] };

export function normalizeFriendlyState(state: string): MatchState {
  const s = String(state || "").trim().toLowerCase();
  if (s === "scheduled" || s === "playing" || s === "finished") return s;
  return "finished";
}

/**
 * Newest day first, and inside a day the most recently entered match first — the
 * order the old fake-tournament grouping produced, kept deliberately: a friendly
 * has no fixture number, so "when it was entered" is the only order there is.
 */
export function groupFriendliesByDate(rows: readonly FriendlyMatchResponse[]): FriendlyDayGroup[] {
  const byDate = new Map<string, FriendlyMatchResponse[]>();
  for (const f of rows) {
    const key = String(f.date || "");
    const arr = byDate.get(key) ?? [];
    arr.push(f);
    byDate.set(key, arr);
  }
  return [...byDate.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((dateKey) => ({
      dateKey,
      rows: [...(byDate.get(dateKey) ?? [])].sort((a, b) => {
        const at = Date.parse(a.created_at);
        const bt = Date.parse(b.created_at);
        if (Number.isFinite(at) && Number.isFinite(bt) && bt !== at) return bt - at;
        return b.id - a.id;
      }),
    }));
}

function sideOf(f: FriendlyMatchResponse, side: "A" | "B") {
  return (f.sides ?? []).find((s) => s.side === side);
}

function namesOf(f: FriendlyMatchResponse, side: "A" | "B"): string[] {
  const names = (sideOf(f, side)?.players ?? []).map((p) => p.display_name).filter(Boolean);
  return names.length ? names : ["—"];
}

function FriendlyRow({
  f,
  clubs,
  showMeta,
  digits,
  open,
  canEdit,
  onToggle,
  editor,
}: {
  f: FriendlyMatchResponse;
  clubs: Club[];
  showMeta: boolean;
  digits: number;
  open: boolean;
  /** The server's per-row answer (A10): only an editor of *this* friendly opens it. */
  canEdit: boolean;
  onToggle: () => void;
  /** The editor, when this row is the open one. Rendered under the row, never inside it. */
  editor: ReactNode;
}) {
  const a = sideOf(f, "A");
  const b = sideOf(f, "B");
  const ag = Number(a?.goals ?? 0);
  const bg = Number(b?.goals ?? 0);
  const aNames = namesOf(f, "A");
  const bNames = namesOf(f, "B");

  const body = (
    <>
      <ScoreLine
        state={normalizeFriendlyState(f.state)}
        size={showMeta ? "md" : "sm"}
        digits={digits}
        leftNames={aNames}
        rightNames={bNames}
        leftGoals={ag}
        rightGoals={bg}
      />
      {showMeta ? (
        <MatchSides
          className="mt-1"
          clubs={clubs}
          aClubId={a?.club_id}
          bClubId={b?.club_id}
          // One line less per side, and the two ratings meet at the centre gap.
          stars="token"
        />
      ) : null}
    </>
  );

  return (
    <div>
      <div className={"row-tap relative -mx-1 px-1 " + (showMeta ? "py-2" : "py-1.5")}>
        {canEdit ? (
          // The `ListRow` pattern (DESIGN.md §7): a real button stretched over the
          // row, the content inert above it. Never a `role="button"` div, and — since
          // the row carries no controls of its own any more — nothing to nest.
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? "Close" : "Open"} friendly: ${aNames.join(" + ")} ${ag}–${bg} ${bNames.join(" + ")}`}
            title={open ? "Close the editor" : "Edit this friendly"}
            className="focus-ring absolute inset-0 z-0 rounded-xl"
          />
        ) : null}
        <div className={canEdit ? "pointer-events-none relative z-10" : "relative z-10"}>{body}</div>
      </div>
      {/* The accent rail says "this belongs to the row above" without adding a
          surface — the same cue a comment thread's replies use. */}
      {open && editor ? <div className="mb-2 mt-2 border-l-2 border-accent/30 pl-2 sm:pl-3">{editor}</div> : null}
    </div>
  );
}

export default function FriendlyList({
  groups,
  clubs,
  showMeta,
  expandedId,
  canEditRow,
  onToggleRow,
  renderEditor,
}: {
  groups: readonly FriendlyDayGroup[];
  clubs: Club[];
  showMeta: boolean;
  expandedId: number | null;
  canEditRow: (f: FriendlyMatchResponse) => boolean;
  onToggleRow: (id: number) => void;
  renderEditor: (f: FriendlyMatchResponse) => ReactNode;
}) {
  // One width for the whole page, not one per day: the reader scans a column that
  // runs past the group headers, so a day of 1–0s must not set a narrower column
  // than the day above it.
  const digits = scoreDigits(
    groups.flatMap((g) => g.rows.flatMap((f) => (f.sides ?? []).map((s) => Number(s.goals ?? 0)))),
  );

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.dateKey} className="space-y-1">
          {/* The date names the group and the count trails the rule (DESIGN.md §6).
              The page's own name is not repeated once per day any more. */}
          <div className="section-head">
            <h2 className="section-label">{fmtDateLong(g.dateKey) || "Undated"}</h2>
            <div className="order-1 shrink-0 text-xs text-text-muted">
              {fmtCount(g.rows.length, "match", "matches")}
            </div>
          </div>

          <div className="list-divided">
            {g.rows.map((f) => (
              <FriendlyRow
                key={f.id}
                f={f}
                clubs={clubs}
                showMeta={showMeta}
                digits={digits}
                open={expandedId === f.id}
                canEdit={canEditRow(f)}
                onToggle={() => onToggleRow(f.id)}
                editor={expandedId === f.id ? renderEditor(f) : null}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
