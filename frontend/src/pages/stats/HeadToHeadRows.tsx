import { type CSSProperties, type ReactNode, useMemo } from "react";

import type { StatsH2HDuo, StatsH2HTeamRivalry } from "../../api/types";
import { fmtInt } from "../../utils/format";
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

export function DuoRow({
  r,
  focusPlayerId,
  onOpenMatches,
}: {
  r: StatsH2HDuo;
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
        <div className="text-[11px] text-text-muted">
          {fmtInt(rr.played)} games · {pct(rr.win_rate)} win · {fmtInt(rr.gf)}:{fmtInt(rr.ga)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono tabular-nums text-sm text-text-normal">{rr.pts_per_match.toFixed(2)} ppm</div>
        <div className="font-mono tabular-nums text-[11px] text-text-muted">
          <span className="text-win">{fmtInt(rr.wins)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-draw">{fmtInt(rr.draws)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-loss">{fmtInt(rr.losses)}</span>
        </div>
      </div>
    </RowShell>
  );
}


export function TeamRivalryRow({
  r,
  focusPlayerId,
  onOpenMatches,
}: {
  r: StatsH2HTeamRivalry;
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
        <div className="text-[11px] text-text-muted">vs</div>
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-semibold text-text-normal">{t2}</div>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-text-muted">
        <span className="shrink-0">
          {fmtInt(rr.played)} games · {closePct} close
        </span>
        <span className="shrink-0 font-mono tabular-nums">
          <span className="text-win">{fmtInt(rr.team1_wins)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-draw">{fmtInt(rr.draws)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-loss">{fmtInt(rr.team2_wins)}</span>
          <span className="text-text-muted"> · </span>
          {fmtInt(rr.team1_gf)}:{fmtInt(rr.team1_ga)}
        </span>
      </div>
    </RowShell>
  );
}
