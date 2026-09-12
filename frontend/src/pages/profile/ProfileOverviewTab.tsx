import { Link } from "react-router-dom";

import Button from "../../ui/primitives/Button";
import Textarea from "../../ui/primitives/Textarea";
import { Pill } from "../../ui/primitives/Pill";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import type { Club, StatsH2HOpponentRow, StatsPlayerMatchesTournament } from "../../api/types";
import { fmtPct, fmtRank } from "../../utils/format";
import { MatchHistoryList, tournamentMatchHref } from "../stats/MatchHistoryList";
import { type FavoriteTeammate } from "./favoriteTeammates";

/**
 * Favorite / Nemesis chip. With a known opponent it links into the stats matchup
 * ("every match against this player"), which follows the Mode / Source filters there.
 */
function RivalCard({ iconClass, label, row, playerId }: {
  iconClass: string;
  label: string;
  row: StatsH2HOpponentRow | null;
  playerId: number | null;
}) {
  const body = (
    <>
      <div className="inline-flex items-center gap-2 text-text-muted">
        <i className={iconClass} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="font-semibold mt-0.5">{row?.opponent.display_name ?? "—"}</div>
      {row ? (
        <div className="text-text-muted mt-0.5">
          <span className="text-win">{row.wins}</span>-<span className="text-draw">{row.draws}</span>-<span className="text-loss">{row.losses}</span> ·{" "}
          {fmtPct(row.pts_per_match)} ppm
        </div>
      ) : null}
    </>
  );
  if (!row || !playerId) return <div className="card-chip px-3 py-2">{body}</div>;
  return (
    <Link
      to={`/stats?view=h2h&player=${playerId}&vs=${row.opponent.id}`}
      title={`All matches against ${row.opponent.display_name}`}
      className="card-chip block px-3 py-2 transition hover:bg-bg-card-chip/40 active:bg-bg-card-chip/50 focus-ring"
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
}: {
  canEdit: boolean;
  bioDraft: string;
  profileBio: string | null;
  onBioChange: (value: string) => void;
  onSaveBio: () => void;
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
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="section-head"><span className="section-label">About</span></div>
        {canEdit ? (
          <>
            <Textarea
              label="Profile text"
              value={bioDraft}
              onChange={(e) => onBioChange(e.target.value)}
              placeholder="Write something about this player…"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={onSaveBio}
                disabled={savingBio || bioDraft === (profileBio ?? "")}
                title="Save profile text"
              >
                {savingBio ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-sm text-text-normal whitespace-pre-wrap">{profileBio?.trim() || "No profile text yet."}</div>
        )}
      </div>

      {/* Rivals */}
      <div className="space-y-2">
        <div className="section-head"><span className="section-label">Rivals</span></div>
        <ErrorToastOnError error={statsH2HError} title="H2H loading failed" />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <RivalCard iconClass="fa-solid fa-face-smile" label="Favorite" row={favorite} playerId={targetPlayerId} />
          <RivalCard iconClass="fa-solid fa-heart-crack" label="Nemesis" row={nemesis} playerId={targetPlayerId} />
        </div>
      </div>

      {/* Favorite teammates (best 2v2 duos) */}
      <div className="space-y-2">
        <div className="section-head"><span className="section-label">Favorite teammates</span></div>
        {favoriteTeammates.length ? (
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            {favoriteTeammates.map((tm) => (
              <div key={tm.id} className="card-chip px-3 py-2">
                <div className="truncate font-semibold">{tm.name}</div>
                <div className="text-text-muted mt-0.5">
                  <span className="text-win">{tm.w}</span>-<span className="text-draw">{tm.d}</span>-<span className="text-loss">{tm.l}</span> ·{" "}
                  {fmtPct(tm.ppm)} ppm
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-text-muted">No 2v2 matches recorded yet.</div>
        )}
      </div>

      {/* Recent activity */}
      <div className="space-y-2">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="section-label">Recent matches</span>
          {allMatchTournaments.length > 2 ? (
            <button type="button" className="shrink-0 text-xs font-medium text-accent" onClick={onViewAllMatches}>
              View all →
            </button>
          ) : null}
        </div>
        <ErrorToastOnError error={statsMatchesError} title="Player matches loading failed" />
        <MatchHistoryList
          tournaments={allMatchTournaments.slice(0, 2)}
          focusId={targetPlayerId}
          clubs={clubs}
          showMeta={false}
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
