/**
 * The clubs list: clubs grouped by stars or by league, one row each (Q15).
 *
 * The row used to end in a ghost **Edit** and a ghost **Delete**, which took 150px
 * of a 358px row at 390px — that is why the longest club names truncated and why
 * the meta line wrapped on half the rows. Now **the row is the only control**: a
 * tap anywhere on it opens that club's editor underneath it, a second tap closes
 * it, and delete lives inside the editor behind `ConfirmDialog`. It is the shape
 * Q7 built for the friendlies list and Q8 kept (`pages/tools/FriendlyList.tsx`),
 * down to the prop shape, so the two lists in this app that open an editor in
 * place open it the same way.
 *
 *   5★ ───────────────────────────────────────────────────────── 16 ▾
 *   🛡 FC Bayern München                                   ← tap to open
 *      EA FC 26 · 🇩🇪 Bundesliga · 5★
 *   │ Name · Stars · League
 *   │ Star history                                         ← the editor, under
 *   │ [🗑 Delete]                      [Cancel] [Save]        the row, on a rail
 *
 * Two rules hold it together:
 *
 * - **The row's action is a stretched overlay** (`DESIGN.md` §7): one `<button>`
 *   at `absolute inset-0 z-0`, the content inert above it at `z-10`. Never a
 *   `role="button"` `<div>`, never a control inside the row's own hit area — and
 *   the overlay is scoped to the row, so the group header's own disclosure button
 *   (a sibling of this body, not a parent) stays reachable and un-nested.
 * - **Someone who cannot edit gets no tap and no affordance**: no overlay, no
 *   `row-tap`, no `aria-expanded` — a row that is only text. `/clubs` is guarded
 *   at `minRole="editor"` today, so that viewer is redirected before they get
 *   here; the branch stays because a route guard is not a component contract.
 */
import type { ReactNode } from "react";

import ClubBadge from "../../ui/ClubBadge";
import NationFlag from "../../ui/NationFlag";
import { nationalTeamNation } from "../../ui/nationalTeams";
import { starsLabel } from "../../ui/clubControls";
import { cn } from "../../ui/cn";
import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import type { Club } from "../../api/types";

/** One row's club plus the two league strings the page already resolved for it. */
export type ClubRowData = {
  club: Club;
  leagueName: string;
  leagueNation: string | null;
};

/** One stars/league group: its header, and the rows under it. */
export type ClubGroup = {
  /** Remount key — the page folds its filter state into it so groups auto-open while filtering. */
  key: string;
  label: string;
  /** Flag for a league group's header; stars groups have none. */
  nation?: string | null;
  /** Quiet word after the label ("league"), when the label alone would not say what it is. */
  suffix?: string;
  rows: ClubRowData[];
};

function ClubRow({
  row,
  canEdit,
  open,
  onToggle,
  editor,
}: {
  row: ClubRowData;
  /** May this viewer open the editor at all? False ⇒ the row is text and nothing else. */
  canEdit: boolean;
  open: boolean;
  onToggle: () => void;
  /** The editor, when this row is the open one. Rendered under the row, never inside it. */
  editor: ReactNode;
}) {
  const c = row.club;
  const metaParts: ReactNode[] = [
    c.game,
    <span key="league" className="inline-flex items-center gap-1">
      <NationFlag nation={row.leagueNation} />
      {row.leagueName}
    </span>,
    `${starsLabel(c.star_rating)}★`,
  ];

  return (
    <div>
      <div className={cn("row relative", canEdit && "row-tap")}>
        {canEdit ? (
          // The `ListRow` pattern (DESIGN.md §7): a real button stretched over the
          // row, the content inert above it. The row carries no controls of its
          // own any more, so there is nothing to nest.
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? "Close" : "Open"} club: ${c.name}`}
            title={open ? "Close the editor" : "Edit this club"}
            className="focus-ring absolute inset-0 z-0 rounded-xl"
          />
        ) : null}

        <div className={cn("relative z-10 min-w-0 flex-1", canEdit && "pointer-events-none")}>
          <div className="flex min-w-0 items-center gap-1.5">
            <ClubBadge
              name={c.name}
              nation={nationalTeamNation(c.name, row.leagueName)}
              clubId={c.id}
              crestVersion={c.crest_updated_at}
            />
            <span className="min-w-0 truncate font-medium text-text-normal">{c.name}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center text-xs text-text-muted">
            {metaParts.map((part, i) => (
              <span key={i} className="inline-flex items-center">
                {/* Spacing, not a third tone — it inherits the meta
                    line's `text-text-muted` (R3). */}
                {i > 0 ? <span className="mx-1.5">·</span> : null}
                {part}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* The accent rail says "this belongs to the row above" without adding a
          surface — the same cue the friendlies list's editor uses (§9b). */}
      {open && editor ? <div className="mb-2 mt-2 border-l-2 border-accent/30 pl-2 sm:pl-3">{editor}</div> : null}
    </div>
  );
}

export default function ClubList({
  groups,
  defaultOpen,
  canEdit,
  expandedId,
  onToggleRow,
  renderEditor,
}: {
  groups: readonly ClubGroup[];
  /** Groups open themselves while the page is filtered or searched. */
  defaultOpen: boolean;
  canEdit: boolean;
  expandedId: number | null;
  /** Tap on a row. The club, not its id — opening seeds the editor from it. */
  onToggleRow: (club: Club) => void;
  renderEditor: (club: Club) => ReactNode;
}) {
  return (
    <div className="divide-y divide-border-card-chip/30">
      {groups.map((g) => (
        <CollapsibleCard
          key={g.key}
          title={
            <span className="section-label inline-flex items-center gap-2">
              {/* `NationFlag` renders nothing without a code, so a stars group needs no branch. */}
              <NationFlag nation={g.nation} />
              <span>{g.label}</span>
              {g.suffix ? <span className="font-normal normal-case text-text-muted">{g.suffix}</span> : null}
            </span>
          }
          right={<span className="text-xs text-text-muted">{g.rows.length}</span>}
          defaultOpen={defaultOpen}
          className="px-0"
        >
          {() => (
            <div className="list-divided">
              {g.rows.map((row) => (
                <ClubRow
                  key={row.club.id}
                  row={row}
                  canEdit={canEdit}
                  open={expandedId === row.club.id}
                  onToggle={() => onToggleRow(row.club)}
                  editor={expandedId === row.club.id ? renderEditor(row.club) : null}
                />
              ))}
            </div>
          )}
        </CollapsibleCard>
      ))}
    </div>
  );
}
