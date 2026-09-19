import { ChevronRight, HeartCrack, Pencil, Smile } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import Button from "../../ui/primitives/Button";
import Textarea from "../../ui/primitives/Textarea";
import { Pill } from "../../ui/primitives/Pill";
import RecordLine, { recordWidths, type RecordWidths } from "../../ui/primitives/RecordLine";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import type { Club, StatsH2HOpponentRow, StatsPlayerMatchesTournament } from "../../api/types";
import { fmtAvg, fmtRank } from "../../utils/format";
import { MatchHistoryList, tournamentMatchHref } from "../stats/MatchHistoryList";
import { statsMatchupHref } from "../stats/statsNav";
import { type FavoriteTeammate } from "./favoriteTeammates";
import SubjectCommentTrigger, { SECTION_HEAD_ACTION_CLASS } from "./SubjectCommentTrigger";

/**
 * Favorite / Nemesis chip. With a known opponent it links into the stats matchup
 * ("every match against this player"), which follows the Mode / Source filters there.
 */
function RivalCard({ icon, label, row, widths, playerId }: {
  icon: ReactNode;
  label: string;
  row: StatsH2HOpponentRow | null;
  widths: RecordWidths;
  playerId: number | null;
}) {
  const body = (
    <>
      <div className="inline-flex items-center gap-2 text-text-muted">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-semibold mt-0.5">{row?.opponent.display_name ?? "—"}</div>
      {row ? (
        <RecordLine
          wins={row.wins}
          draws={row.draws}
          losses={row.losses}
          widths={widths}
          extra={`${fmtAvg(row.pts_per_match)} ppm`}
          className="mt-0.5 text-text-muted"
        />
      ) : null}
    </>
  );
  if (!row || !playerId) return <div className="inset px-3 py-2">{body}</div>;
  return (
    <Link
      to={statsMatchupHref({ left: [playerId], right: [row.opponent.id] })}
      title={`All matches against ${row.opponent.display_name}`}
      className="inset block px-3 py-2 transition hover:bg-bg-card-chip/40 active:bg-bg-card-chip/50 focus-ring"
    >
      {body}
    </Link>
  );
}

/** Profile "Overview" tab: about/bio, rivals, favorite teammates, recent matches. */
export default function ProfileOverviewTab({
  canEdit,
  bioDraft,
  profileBio,
  onBioChange,
  onSaveBio,
  savingBio,
  favorite,
  nemesis,
  statsH2HError,
  favoriteTeammates,
  allMatchTournaments,
  clubs,
  tournamentPlacementById,
  targetPlayerId,
  statsMatchesError,
  onViewAllMatches,
  aboutCommentCount,
  canPostGuestbook,
  onCommentOnAbout,
}: {
  canEdit: boolean;
  bioDraft: string;
  profileBio: string | null;
  onBioChange: (value: string) => void;
  /** Resolves when the bio is saved and the profile query has caught up; rejects on failure. */
  onSaveBio: () => Promise<unknown>;
  savingBio: boolean;
  favorite: StatsH2HOpponentRow | null;
  nemesis: StatsH2HOpponentRow | null;
  statsH2HError: unknown;
  favoriteTeammates: FavoriteTeammate[];
  allMatchTournaments: StatsPlayerMatchesTournament[];
  clubs: Club[];
  tournamentPlacementById: Map<number, { position: number; total: number | null }>;
  targetPlayerId: number;
  statsMatchesError: unknown;
  onViewAllMatches: () => void;
  /** Guestbook entries about the *saved* About text as it stands now (K3). */
  aboutCommentCount: number;
  canPostGuestbook: boolean;
  onCommentOnAbout: () => void;
}) {
  /**
   * The owner reads their own About block exactly as a visitor does, and edits it only when
   * they say so (Roli 2026-09-19: "about text on own profile should look exactly like other
   * profiles, with edit button beside comments label") — the move M8 made on the profile
   * header, applied to the wall below it. The draft wiring is untouched: opening seeds the
   * field from the saved text, Cancel puts it back, so an abandoned edit leaves nothing.
   */
  const [editingBio, setEditingBio] = useState(false);
  const editingAbout = canEdit && editingBio;
  const savedBio = profileBio ?? "";

  // One set of column widths per block, so the cards in a grid line up (T14).
  const rivalWidths = recordWidths([favorite, nemesis]);
  const teammateWidths = recordWidths(favoriteTeammates.map((tm) => ({ wins: tm.w, draws: tm.d, losses: tm.l })));
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="section-head">
          <span className="section-label">About</span>
          {/* `order-1` is the section-head's action slot — label · ───── · action (`DESIGN.md`
              §6). Two actions here, and they are a matched pair: both are the `h-8` ghost
              button the app already uses for "comment on this", because one of them *is* that
              control and a second, smaller look for the button beside it would be a third head
              treatment (rule 8). The head is therefore 32px, as it has been since K3.
              Edit sits inboard of the trigger, so the comments control keeps the same corner
              for a visitor and for the owner — the owner's page is the visitor's page plus one
              button (M8). It hides while its own editor is open; the trigger does not, because
              it is about the *saved* text and that has not moved.
              An empty About has no trigger — there is nothing to pin and the server would
              answer 409 — but the way in must never hide, or an owner with no bio could never
              write one. */}
          {(canEdit && !editingAbout) || savedBio.trim() ? (
            <div className="order-1 shrink-0 flex items-center gap-1.5">
              {canEdit && !editingAbout ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onBioChange(savedBio);
                    setEditingBio(true);
                  }}
                  title="Edit the About text"
                  aria-label="Edit the About text"
                  data-edit-about
                  className={SECTION_HEAD_ACTION_CLASS}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Edit
                </Button>
              ) : null}
              {savedBio.trim() ? (
                <SubjectCommentTrigger
                  kind="about"
                  count={aboutCommentCount}
                  canPost={canPostGuestbook}
                  onOpen={() => onCommentOnAbout()}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        {editingAbout ? (
          <>
            <Textarea
              label="Profile text"
              value={bioDraft}
              onChange={(e) => onBioChange(e.target.value)}
              placeholder="Write something about this player…"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onBioChange(savedBio);
                  setEditingBio(false);
                }}
                disabled={savingBio}
                title="Discard the changes"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await onSaveBio();
                      setEditingBio(false);
                    } catch {
                      // The page's own toast says what went wrong; the draft stays on screen.
                    }
                  })();
                }}
                disabled={savingBio || bioDraft === savedBio}
                title="Save profile text"
              >
                {savingBio ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-sm text-text-normal whitespace-pre-wrap">{savedBio.trim() || "No profile text yet."}</div>
        )}
      </div>

      {/* Rivals */}
      <div className="space-y-2">
        <div className="section-head"><span className="section-label">Rivals</span></div>
        <ErrorToastOnError error={statsH2HError} title="H2H loading failed" />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <RivalCard icon={<Smile size={14} aria-hidden="true" />} label="Favorite" row={favorite} widths={rivalWidths} playerId={targetPlayerId} />
          <RivalCard icon={<HeartCrack size={14} aria-hidden="true" />} label="Nemesis" row={nemesis} widths={rivalWidths} playerId={targetPlayerId} />
        </div>
      </div>

      {/* Favorite teammates (best 2v2 duos) */}
      <div className="space-y-2">
        <div className="section-head"><span className="section-label">Favorite teammates</span></div>
        {favoriteTeammates.length ? (
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            {favoriteTeammates.map((tm) => {
              const body = (
                <>
                  <div className="truncate font-semibold">{tm.name}</div>
                  <RecordLine
                    wins={tm.w}
                    draws={tm.d}
                    losses={tm.l}
                    widths={teammateWidths}
                    extra={`${fmtAvg(tm.ppm)} ppm`}
                    className="mt-0.5 text-text-muted"
                  />
                </>
              );
              // Like the rival cards: the summary opens every match behind it — here the
              // 2v2 matchup in its "Together" relation.
              if (!targetPlayerId) return <div key={tm.id} className="inset px-3 py-2">{body}</div>;
              return (
                <Link
                  key={tm.id}
                  to={statsMatchupHref({ mode: "2v2", left: [targetPlayerId], right: [tm.id], relation: "together" })}
                  title={`All 2v2 matches together with ${tm.name}`}
                  className="inset block px-3 py-2 transition hover:bg-bg-card-chip/40 active:bg-bg-card-chip/50 focus-ring"
                >
                  {body}
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-text-muted">No 2v2 matches recorded yet.</div>
        )}
      </div>

      {/* Recent activity */}
      <div className="space-y-2">
        <div className="section-head">
          <span className="section-label">Recent matches</span>
          {allMatchTournaments.length > 2 ? (
            <button
              type="button"
              className="order-1 shrink-0 inline-flex items-center gap-1 text-xs text-text-muted transition hover:text-text-normal"
              onClick={onViewAllMatches}
            >
              View all <ChevronRight size={14} />
            </button>
          ) : null}
        </div>
        <ErrorToastOnError error={statsMatchesError} title="Player matches loading failed" />
        <MatchHistoryList
          tournaments={allMatchTournaments.slice(0, 2)}
          focusId={targetPlayerId}
          clubs={clubs}
          showMeta={false}
          showModePill
          matchHref={tournamentMatchHref}
          renderTournamentPills={(t) => {
            const row = tournamentPlacementById.get(Number(t.id));
            if (!row) return null;
            return (
              <Pill className="pill-default" title="Tournament position">
                {fmtRank(row.position, row.total)}
              </Pill>
            );
          }}
        />
      </div>
    </div>
  );
}
