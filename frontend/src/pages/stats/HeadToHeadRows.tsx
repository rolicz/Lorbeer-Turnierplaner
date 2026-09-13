/* eslint-disable react-refresh/only-export-components -- `teamRivalryWidths` sizes a
   whole list of these rows and belongs next to them. */
import { type CSSProperties, type ReactNode, useMemo } from "react";

import type { StatsH2HDuo, StatsH2HTeamRivalry } from "../../api/types";
import RecordLine, { recordWidths, type RecordWidths } from "../../ui/primitives/RecordLine";
import { normalizeTeamRivalryForFocus, pct } from "./h2hHelpers";

function RowShell({
  onClick,
  className,
  style,
  children,
}: {
  onClick?: (() => void) | null;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} w-full appearance-none border-0 text-left transition hover:bg-bg-card-chip/40 active:bg-bg-card-chip/50`}
        style={style}
      >
        {children}
      </button>
    );
  }
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

/**
 * Column widths for a list of duo-vs-duo rows. A row can be flipped to put the focus
 * duo first, so both orientations are measured and the wider one wins — the widths must
 * hold whichever way round the row ends up being drawn.
 */
export function teamRivalryWidths(rows: readonly StatsH2HTeamRivalry[]): RecordWidths {
  return recordWidths(
    rows.map((r) => ({
      played: r.played,
      wins: Math.max(r.team1_wins, r.team2_wins),
      draws: r.draws,
      losses: Math.max(r.team1_wins, r.team2_wins),
      gf: Math.max(r.team1_gf, r.team2_gf),
      ga: Math.max(r.team1_ga, r.team2_ga),
    })),
  );
}

export function DuoRow({
  r,
  widths,
  focusPlayerId,
  onOpenMatches,
}: {
  r: StatsH2HDuo;
  /** Column widths for the whole list this row belongs to (T14). */
  widths: RecordWidths;
  focusPlayerId?: number | null;
  onOpenMatches?: ((r: StatsH2HDuo) => void) | null;
}) {
  const rr = useMemo(() => {
    const pid = focusPlayerId ?? null;
    if (!pid) return r;
    if (r.p1.id === pid) return r;
    if (r.p2.id !== pid) return r;
    return { ...r, p1: r.p2, p2: r.p1 };
  }, [r, focusPlayerId]);

  return (
    <RowShell
      onClick={onOpenMatches ? () => onOpenMatches(rr) : null}
      className="inset flex items-center justify-between gap-3 px-3 py-2"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-text-normal">
          {rr.p1.display_name} <span className="text-text-muted">/</span> {rr.p2.display_name}
        </div>
        <RecordLine
          played={rr.played}
          gf={rr.gf}
          ga={rr.ga}
          widths={widths}
          playedLabel="games"
          extra={`${pct(rr.win_rate)} win`}
          className="text-xs text-text-muted"
        />
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono tabular-nums text-sm text-text-normal">{rr.pts_per_match.toFixed(2)} ppm</div>
        <RecordLine
          wins={rr.wins}
          draws={rr.draws}
          losses={rr.losses}
          widths={widths}
          className="font-mono text-xs text-text-muted"
        />
      </div>
    </RowShell>
  );
}


export function TeamRivalryRow({
  r,
  widths,
  focusPlayerId,
  onOpenMatches,
}: {
  r: StatsH2HTeamRivalry;
  /** Column widths for the whole list this row belongs to (T14). */
  widths: RecordWidths;
  focusPlayerId?: number | null;
  onOpenMatches?: ((r: StatsH2HTeamRivalry) => void) | null;
}) {
  const rr = useMemo(() => normalizeTeamRivalryForFocus(r, focusPlayerId ?? null), [r, focusPlayerId]);
  const team1 = useMemo(() => {
    const pid = focusPlayerId ?? null;
    if (!pid) return rr.team1;
    if (!rr.team1?.length) return rr.team1;
    if (rr.team1[0]?.id === pid) return rr.team1;
    if (rr.team1[1]?.id !== pid) return rr.team1;
    return [rr.team1[1], rr.team1[0]];
  }, [rr.team1, focusPlayerId]);

  const t1 = team1.map((p) => p.display_name).join("/");
  const t2 = rr.team2.map((p) => p.display_name).join("/");
  const closePct = pct(rr.rivalry_score / Math.max(1, rr.played));
  return (
    <RowShell
      onClick={onOpenMatches ? () => onOpenMatches(rr) : null}
      className="inset px-3 py-2"
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text-normal">{t1}</div>
        </div>
        <div className="text-xs text-text-muted">vs</div>
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-semibold text-text-normal">{t2}</div>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-text-muted">
        <RecordLine
          played={rr.played}
          widths={widths}
          playedLabel="games"
          extra={`${closePct} close`}
          className="shrink-0"
        />
        <RecordLine
          wins={rr.team1_wins}
          draws={rr.draws}
          losses={rr.team2_wins}
          gf={rr.team1_gf}
          ga={rr.team1_ga}
          widths={widths}
          className="shrink-0 font-mono"
        />
      </div>
    </RowShell>
  );
}
